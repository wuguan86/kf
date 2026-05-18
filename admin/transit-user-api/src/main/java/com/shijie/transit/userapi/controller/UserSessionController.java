package com.shijie.transit.userapi.controller;

import com.shijie.transit.common.security.JwtAuthenticationFilter;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.service.UserSessionService;
import com.shijie.transit.userapi.session.UserSessionEmitterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/user/session")
public class UserSessionController {
  private static final Logger log = LoggerFactory.getLogger(UserSessionController.class);
  private final UserSessionEmitterRegistry userSessionEmitterRegistry;
  private final UserSessionService userSessionService;

  public UserSessionController(
      UserSessionEmitterRegistry userSessionEmitterRegistry,
      UserSessionService userSessionService) {
    this.userSessionEmitterRegistry = userSessionEmitterRegistry;
    this.userSessionService = userSessionService;
  }

  @GetMapping("/events")
  public SseEmitter events(HttpServletRequest request) throws IOException {
    TransitPrincipal principal = currentPrincipal();
    Long tenantId = TenantContext.getTenantId();
    Object sessionIdObj = request.getAttribute(JwtAuthenticationFilter.REQUEST_ATTR_SESSION_ID);
    String sessionId = sessionIdObj == null ? "" : String.valueOf(sessionIdObj);
    if (tenantId == null || sessionId.isBlank()) {
      throw new IllegalArgumentException("会话参数缺失，无法建立SSE连接");
    }

    SseEmitter emitter = new SseEmitter(Duration.ofMinutes(30).toMillis());
    userSessionEmitterRegistry.register(tenantId, principal.subjectId(), sessionId, emitter);
    userSessionService.touchSession(sessionId);
    emitter.send(SseEmitter.event().name("session")
        .data(new UserSessionEmitterRegistry.UserSessionEvent("PING", sessionId, "连接已建立", java.time.Instant.now().toString())));
    log.info("用户SSE连接建立 tenantId={} userId={} sessionId={}", tenantId, principal.subjectId(), sessionId);
    return emitter;
  }

  private TransitPrincipal currentPrincipal() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    return (TransitPrincipal) authentication.getPrincipal();
  }
}
