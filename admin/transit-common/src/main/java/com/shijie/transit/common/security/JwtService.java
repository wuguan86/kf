package com.shijie.transit.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class JwtService {
  private final JwtProperties properties;
  private final SecretKey secretKey;
  private final Clock clock;

  public JwtService(JwtProperties properties, Clock clock) {
    this.properties = properties;
    this.secretKey = buildSecretKey(properties.getSecret());
    this.clock = clock;
  }

  public String issueToken(TransitJwtClaims claims) {
    Instant now = Instant.now(clock);
    Instant exp = now.plus(properties.getTtl());

    return Jwts.builder()
        .issuer(properties.getIssuer())
        .subject(String.valueOf(claims.subjectId()))
        .issuedAt(Date.from(now))
        .expiration(Date.from(exp))
        .claim("tenantId", claims.tenantId())
        .claim("type", claims.type())
        .claim("sessionId", claims.sessionId())
        .signWith(secretKey, SignatureAlgorithm.HS256)
        .compact();
  }

  public TransitJwtClaims parseToken(String token) {
    Claims claims = Jwts.parser()
        .verifyWith(secretKey)
        .requireIssuer(properties.getIssuer())
        .build()
        .parseSignedClaims(token)
        .getPayload();

    String subject = claims.getSubject();
    Object tenantIdObj = claims.get("tenantId");
    Object typeObj = claims.get("type");
    Object sessionIdObj = claims.get("sessionId");

    if (!StringUtils.hasText(subject) || tenantIdObj == null || typeObj == null || sessionIdObj == null) {
      throw new IllegalArgumentException("JWT claims missing");
    }

    long subjectId = Long.parseLong(subject);
    long tenantId = ((Number) tenantIdObj).longValue();
    String type = String.valueOf(typeObj);
    String sessionId = String.valueOf(sessionIdObj);
    if (!StringUtils.hasText(sessionId)) {
      throw new IllegalArgumentException("JWT sessionId missing");
    }
    return new TransitJwtClaims(subjectId, tenantId, type, sessionId);
  }

  private SecretKey buildSecretKey(String secret) {
    if (!StringUtils.hasText(secret)) {
      throw new IllegalStateException("transit.jwt.secret is required");
    }
    byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
    if (bytes.length < 32) {
      throw new IllegalStateException("transit.jwt.secret must be at least 32 bytes for HS256");
    }
    return Keys.hmacShaKeyFor(bytes);
  }
}
