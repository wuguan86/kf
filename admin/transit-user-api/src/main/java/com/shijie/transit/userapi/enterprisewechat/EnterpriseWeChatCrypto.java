package com.shijie.transit.userapi.enterprisewechat;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class EnterpriseWeChatCrypto {
  private static final int BLOCK_SIZE = 32;
  private static final long MAX_TIMESTAMP_DRIFT_SECONDS = 300L;
  private final Clock clock;

  public EnterpriseWeChatCrypto(Clock clock) {
    this.clock = clock;
  }

  public String decrypt(
      String token,
      String encodingAesKey,
      String corpId,
      String signature,
      String timestamp,
      String nonce,
      String encrypted) {
    if (!StringUtils.hasText(token)
        || !StringUtils.hasText(encodingAesKey)
        || !StringUtils.hasText(corpId)
        || !StringUtils.hasText(signature)
        || !StringUtils.hasText(timestamp)
        || !StringUtils.hasText(nonce)
        || !StringUtils.hasText(encrypted)) {
      throw new IllegalArgumentException("企业微信加解密参数不完整");
    }
    verifyTimestamp(timestamp);
    String expectedSignature = sign(token, timestamp, nonce, encrypted);
    if (!expectedSignature.equalsIgnoreCase(signature.trim())) {
      throw new IllegalArgumentException("企业微信回调签名校验失败");
    }
    try {
      byte[] key = decodeKey(encodingAesKey);
      Cipher cipher = Cipher.getInstance("AES/CBC/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(key, 0, 16));
      byte[] decrypted = cipher.doFinal(Base64.getDecoder().decode(encrypted));
      byte[] raw = removePadding(decrypted);
      if (raw.length < 20) {
        throw new IllegalArgumentException("企业微信回调密文长度非法");
      }
      int messageLength = ((raw[16] & 0xff) << 24)
          | ((raw[17] & 0xff) << 16)
          | ((raw[18] & 0xff) << 8)
          | (raw[19] & 0xff);
      int messageStart = 20;
      int messageEnd = messageStart + messageLength;
      if (messageLength < 0 || messageEnd > raw.length) {
        throw new IllegalArgumentException("企业微信回调消息长度非法");
      }
      String plainText = new String(raw, messageStart, messageLength, StandardCharsets.UTF_8);
      String fromCorpId = new String(raw, messageEnd, raw.length - messageEnd, StandardCharsets.UTF_8);
      if (!corpId.equals(fromCorpId)) {
        throw new IllegalArgumentException("企业微信回调 CorpId 不匹配");
      }
      return plainText;
    } catch (IllegalArgumentException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new IllegalArgumentException("企业微信回调解密失败", ex);
    }
  }

  public String sign(String token, String timestamp, String nonce, String encrypted) {
    try {
      String[] values = new String[] {token, timestamp, nonce, encrypted};
      Arrays.sort(values);
      MessageDigest digest = MessageDigest.getInstance("SHA-1");
      byte[] bytes = digest.digest(String.join("", values).getBytes(StandardCharsets.UTF_8));
      StringBuilder builder = new StringBuilder();
      for (byte value : bytes) {
        builder.append(String.format("%02x", value & 0xff));
      }
      return builder.toString();
    } catch (Exception ex) {
      throw new IllegalArgumentException("企业微信回调签名生成失败", ex);
    }
  }

  private void verifyTimestamp(String timestamp) {
    try {
      long callbackEpochSeconds = Long.parseLong(timestamp.trim());
      long nowEpochSeconds = Instant.now(clock).getEpochSecond();
      if (Math.abs(nowEpochSeconds - callbackEpochSeconds) > MAX_TIMESTAMP_DRIFT_SECONDS) {
        throw new IllegalArgumentException("企业微信回调时间戳已过期");
      }
    } catch (NumberFormatException ex) {
      throw new IllegalArgumentException("企业微信回调时间戳非法", ex);
    }
  }

  private byte[] decodeKey(String encodingAesKey) {
    if (encodingAesKey.length() != 43) {
      throw new IllegalArgumentException("企业微信 EncodingAESKey 长度必须为 43 位");
    }
    return Base64.getDecoder().decode(encodingAesKey + "=");
  }

  private byte[] removePadding(byte[] input) {
    if (input.length == 0) {
      throw new IllegalArgumentException("企业微信回调密文为空");
    }
    int pad = input[input.length - 1] & 0xff;
    if (pad < 1 || pad > BLOCK_SIZE) {
      pad = 0;
    }
    return Arrays.copyOf(input, input.length - pad);
  }
}
