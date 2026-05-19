package com.shijie.transit.userapi.enterprisewechat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class EnterpriseWeChatCryptoTest {
  private static final String TOKEN = "test-token";
  private static final String CORP_ID = "ww-test-corp";
  private static final String AES_KEY = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
  private static final Clock FIXED_CLOCK = Clock.fixed(Instant.ofEpochSecond(1710000000L), ZoneOffset.UTC);

  @Test
  void decryptEchoStringWhenSignatureIsValid() throws Exception {
    EnterpriseWeChatCrypto crypto = new EnterpriseWeChatCrypto(FIXED_CLOCK);
    String echo = encrypt("hello-url-verify");
    String timestamp = "1710000000";
    String nonce = "nonce";
    String signature = signature(TOKEN, timestamp, nonce, echo);

    String result = crypto.decrypt(TOKEN, AES_KEY, CORP_ID, signature, timestamp, nonce, echo);

    assertEquals("hello-url-verify", result);
  }

  @Test
  void rejectInvalidSignatureBeforeDecrypting() throws Exception {
    EnterpriseWeChatCrypto crypto = new EnterpriseWeChatCrypto(FIXED_CLOCK);
    String echo = encrypt("hello-url-verify");

    assertThrows(IllegalArgumentException.class,
        () -> crypto.decrypt(TOKEN, AES_KEY, CORP_ID, "bad-signature", "1710000000", "nonce", echo));
  }

  @Test
  void rejectExpiredTimestamp() throws Exception {
    EnterpriseWeChatCrypto crypto = new EnterpriseWeChatCrypto(FIXED_CLOCK);
    String echo = encrypt("hello-url-verify");
    String timestamp = "1709990000";
    String nonce = "nonce";
    String signature = signature(TOKEN, timestamp, nonce, echo);

    assertThrows(IllegalArgumentException.class,
        () -> crypto.decrypt(TOKEN, AES_KEY, CORP_ID, signature, timestamp, nonce, echo));
  }

  private static String signature(String token, String timestamp, String nonce, String encrypted) throws Exception {
    String[] values = new String[] {token, timestamp, nonce, encrypted};
    Arrays.sort(values);
    MessageDigest digest = MessageDigest.getInstance("SHA-1");
    byte[] bytes = digest.digest(String.join("", values).getBytes(StandardCharsets.UTF_8));
    StringBuilder builder = new StringBuilder();
    for (byte value : bytes) {
      builder.append(String.format("%02x", value & 0xff));
    }
    return builder.toString();
  }

  private static String encrypt(String plainText) throws Exception {
    byte[] key = Base64.getDecoder().decode(AES_KEY + "=");
    byte[] random = "abcdefghijklmnop".getBytes(StandardCharsets.UTF_8);
    byte[] msg = plainText.getBytes(StandardCharsets.UTF_8);
    byte[] length = new byte[] {
        (byte) ((msg.length >> 24) & 0xff),
        (byte) ((msg.length >> 16) & 0xff),
        (byte) ((msg.length >> 8) & 0xff),
        (byte) (msg.length & 0xff)
    };
    byte[] corp = CORP_ID.getBytes(StandardCharsets.UTF_8);
    byte[] raw = new byte[random.length + length.length + msg.length + corp.length];
    System.arraycopy(random, 0, raw, 0, random.length);
    System.arraycopy(length, 0, raw, random.length, length.length);
    System.arraycopy(msg, 0, raw, random.length + length.length, msg.length);
    System.arraycopy(corp, 0, raw, random.length + length.length + msg.length, corp.length);
    byte[] padded = pkcs7(raw);

    Cipher cipher = Cipher.getInstance("AES/CBC/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(key, 0, 16));
    return Base64.getEncoder().encodeToString(cipher.doFinal(padded));
  }

  private static byte[] pkcs7(byte[] input) {
    int blockSize = 32;
    int pad = blockSize - (input.length % blockSize);
    if (pad == 0) {
      pad = blockSize;
    }
    byte[] output = Arrays.copyOf(input, input.length + pad);
    Arrays.fill(output, input.length, output.length, (byte) pad);
    return output;
  }
}
