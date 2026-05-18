package com.shijie.transit.userapi.controller;

import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.service.WeChatAuthService;
import com.shijie.transit.userapi.wechat.WeChatMpProperties;
import com.shijie.transit.userapi.wechat.WeChatOpenProperties;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.w3c.dom.Document;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

@RestController
@RequestMapping("/api/user/auth/wechat")
public class UserAuthController {
  private final WeChatAuthService weChatAuthService;
  private final WeChatMpProperties weChatMpProperties;
  private final WeChatOpenProperties weChatOpenProperties;

  public UserAuthController(
      WeChatAuthService weChatAuthService,
      WeChatMpProperties weChatMpProperties,
      WeChatOpenProperties weChatOpenProperties) {
    this.weChatAuthService = weChatAuthService;
    this.weChatMpProperties = weChatMpProperties;
    this.weChatOpenProperties = weChatOpenProperties;
  }

  @GetMapping("/qrcode")
  public Result<WeChatAuthService.QrCodeResult> qrcode(
      @RequestParam(name = "tenantId", required = false, defaultValue = "1") long tenantId,
      @RequestParam(name = "redirect", required = false) String redirect) {
    return Result.success(weChatAuthService.createQrCode(tenantId, redirect));
  }

  @GetMapping("/callback")
  public ResponseEntity<String> callbackVerify(
      @RequestParam(name = "signature", required = false) String signature,
      @RequestParam(name = "msg_signature", required = false) String msgSignature,
      @RequestParam(name = "timestamp", required = false) String timestamp,
      @RequestParam(name = "nonce", required = false) String nonce,
      @RequestParam(name = "echostr", required = false) String echostr) {
    if (echostr == null || echostr.isBlank() || timestamp == null || timestamp.isBlank() || nonce == null || nonce.isBlank()) {
      return ResponseEntity.badRequest()
          .contentType(MediaType.TEXT_PLAIN)
          .body("echostr/timestamp/nonce required");
    }

    String token = weChatMpProperties.getToken();
    if (token == null || token.isBlank()) {
      return ResponseEntity.status(500)
          .contentType(MediaType.TEXT_PLAIN)
          .body("wechat mp token not configured");
    }

    if (msgSignature != null && !msgSignature.isBlank()) {
      if (!verifySignature(token, msgSignature, timestamp, nonce, echostr)) {
        return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN).body("invalid signature");
      }
      String plain = decryptCipherText(echostr, weChatMpProperties.getEncodingAesKey(), weChatOpenProperties.getAppId());
      if (plain == null) {
        return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN).body("decrypt failed");
      }
      return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(plain);
    }

    if (signature == null || signature.isBlank()) {
      return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN).body("signature required");
    }
    if (!verifySignature(token, signature, timestamp, nonce)) {
      return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN).body("invalid signature");
    }
    return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(echostr);
  }

  @PostMapping(
      value = "/callback",
      consumes = {MediaType.TEXT_XML_VALUE, MediaType.APPLICATION_XML_VALUE, MediaType.ALL_VALUE},
      produces = MediaType.TEXT_PLAIN_VALUE)
  public ResponseEntity<String> callbackMessage(
      @RequestParam(name = "signature", required = false) String signature,
      @RequestParam(name = "msg_signature", required = false) String msgSignature,
      @RequestParam(name = "timestamp", required = false) String timestamp,
      @RequestParam(name = "nonce", required = false) String nonce,
      @RequestBody(required = false) String body) {
    if (timestamp == null || timestamp.isBlank() || nonce == null || nonce.isBlank()) {
      return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN).body("timestamp/nonce required");
    }

    String token = weChatMpProperties.getToken();
    if (token == null || token.isBlank()) {
      return ResponseEntity.status(500).contentType(MediaType.TEXT_PLAIN).body("wechat mp token not configured");
    }
    if (body == null || body.isBlank()) {
      return ResponseEntity.ok("success");
    }

    boolean encrypted = (msgSignature != null && !msgSignature.isBlank()) || body.contains("<Encrypt>");
    String plainXml = body;
    if (encrypted) {
      if (msgSignature == null || msgSignature.isBlank()) {
        return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN).body("msg_signature required");
      }
      Map<String, String> outer = parseXmlFirstLevel(body);
      String encrypt = outer.get("Encrypt");
      if (encrypt == null || encrypt.isBlank()) {
        return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN).body("encrypt required");
      }
      if (!verifySignature(token, msgSignature, timestamp, nonce, encrypt)) {
        return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN).body("invalid signature");
      }
      plainXml = decryptCipherText(encrypt, weChatMpProperties.getEncodingAesKey(), weChatOpenProperties.getAppId());
      if (plainXml == null) {
        return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN).body("decrypt failed");
      }
    } else {
      if (signature == null || signature.isBlank()) {
        return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN).body("signature required");
      }
      if (!verifySignature(token, signature, timestamp, nonce)) {
        return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN).body("invalid signature");
      }
    }

    Map<String, String> msg = parseXmlFirstLevel(plainXml);
    String msgType = msg.get("MsgType");
    if (msgType == null || !"event".equalsIgnoreCase(msgType)) {
      return ResponseEntity.ok("success");
    }

    String event = msg.get("Event");
    String fromUserName = msg.get("FromUserName");
    String eventKey = msg.get("EventKey");
    if (event == null || fromUserName == null || fromUserName.isBlank()) {
      return ResponseEntity.ok("success");
    }

    String scene = null;
    if ("SCAN".equalsIgnoreCase(event)) {
      scene = eventKey;
    } else if ("subscribe".equalsIgnoreCase(event)) {
      scene = eventKey;
      if (scene != null && scene.startsWith("qrscene_")) {
        scene = scene.substring("qrscene_".length());
      }
    }

    if (scene != null && !scene.isBlank()) {
      weChatAuthService.handleScanLogin(fromUserName, scene);
    }
    return ResponseEntity.ok("success");
  }

  @GetMapping("/status")
  public Result<WeChatAuthService.LoginPollResult> status(@RequestParam("state") String state) {
    return Result.success(weChatAuthService.pollLogin(state));
  }

  private static boolean verifySignature(String token, String signature, String timestamp, String nonce) {
    String[] parts = new String[] {token, timestamp, nonce};
    Arrays.sort(parts);
    String raw = String.join("", parts);
    String expected = sha1Hex(raw);
    return expected != null && expected.equalsIgnoreCase(signature);
  }

  private static boolean verifySignature(String token, String signature, String timestamp, String nonce, String echostr) {
    String[] parts = new String[] {token, timestamp, nonce, echostr};
    Arrays.sort(parts);
    String raw = String.join("", parts);
    String expected = sha1Hex(raw);
    return expected != null && expected.equalsIgnoreCase(signature);
  }

  private static String sha1Hex(String input) {
    try {
      MessageDigest md = MessageDigest.getInstance("SHA-1");
      byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
      StringBuilder sb = new StringBuilder(digest.length * 2);
      for (byte b : digest) {
        sb.append(Character.forDigit((b >> 4) & 0xF, 16));
        sb.append(Character.forDigit(b & 0xF, 16));
      }
      return sb.toString();
    } catch (Exception e) {
      return null;
    }
  }

  private static String decryptCipherText(String cipherTextBase64, String encodingAesKey, String appId) {
    if (encodingAesKey == null || encodingAesKey.isBlank()) {
      return null;
    }
    if (appId == null || appId.isBlank()) {
      return null;
    }
    try {
      byte[] aesKey = Base64.getDecoder().decode(encodingAesKey + "=");
      byte[] cipherText = Base64.getDecoder().decode(cipherTextBase64);
      Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
      SecretKeySpec keySpec = new SecretKeySpec(aesKey, "AES");
      IvParameterSpec iv = new IvParameterSpec(Arrays.copyOfRange(aesKey, 0, 16));
      cipher.init(Cipher.DECRYPT_MODE, keySpec, iv);
      byte[] plain = cipher.doFinal(cipherText);

      if (plain.length < 20) {
        return null;
      }

      int msgLen = ((plain[16] & 0xFF) << 24)
          | ((plain[17] & 0xFF) << 16)
          | ((plain[18] & 0xFF) << 8)
          | (plain[19] & 0xFF);
      int msgStart = 20;
      int msgEnd = msgStart + msgLen;
      if (msgLen < 0 || msgEnd > plain.length) {
        return null;
      }

      String msg = new String(Arrays.copyOfRange(plain, msgStart, msgEnd), StandardCharsets.UTF_8);
      String tailAppId = new String(Arrays.copyOfRange(plain, msgEnd, plain.length), StandardCharsets.UTF_8).trim();
      if (!tailAppId.isEmpty() && !tailAppId.equals(appId)) {
        return null;
      }
      return msg;
    } catch (Exception e) {
      return null;
    }
  }

  private static Map<String, String> parseXmlFirstLevel(String xml) {
    if (xml == null || xml.isBlank()) {
      return Map.of();
    }
    try {
      DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
      factory.setExpandEntityReferences(false);
      factory.setXIncludeAware(false);
      factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
      factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
      factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);

      Document doc = factory.newDocumentBuilder().parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
      Node root = doc.getDocumentElement();
      if (root == null) {
        return Map.of();
      }
      NodeList children = root.getChildNodes();
      Map<String, String> map = new HashMap<>();
      for (int i = 0; i < children.getLength(); i++) {
        Node node = children.item(i);
        if (node == null || node.getNodeType() != Node.ELEMENT_NODE) {
          continue;
        }
        String key = node.getNodeName();
        String value = node.getTextContent();
        if (key != null && value != null) {
          map.put(key, value.trim());
        }
      }
      return map;
    } catch (Exception e) {
      return Map.of();
    }
  }
}
