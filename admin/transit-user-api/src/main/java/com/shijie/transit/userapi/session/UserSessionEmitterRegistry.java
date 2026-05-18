package com.shijie.transit.userapi.session;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Component
public class UserSessionEmitterRegistry {
  private static final Logger log = LoggerFactory.getLogger(UserSessionEmitterRegistry.class);
  private static final List<String> CLIENT_DISCONNECT_MESSAGES = List.of(
      "broken pipe",
      "connection reset",
      "an established connection was aborted by the software in your host machine",
      "an existing connection was forcibly closed by the remote host",
      "你的主机中的软件中止了一个已建立的连接",
      "远程主机强迫关闭了一个现有的连接");
  private final Map<String, SseEmitter> emitterMap = new ConcurrentHashMap<>();
  private final Clock clock;

  public UserSessionEmitterRegistry(Clock clock) {
    this.clock = clock;
  }

  public void register(long tenantId, long userId, String sessionId, SseEmitter emitter) {
    String key = key(tenantId, userId, sessionId);
    SseEmitter old = emitterMap.put(key, emitter);
    if (old != null) {
      old.complete();
    }
    log.info("SSE会话连接已注册 tenantId={} userId={} sessionId={}", tenantId, userId, sessionId);
    emitter.onCompletion(() -> remove(tenantId, userId, sessionId));
    emitter.onTimeout(() -> remove(tenantId, userId, sessionId));
    emitter.onError(ex -> {
      if (isClientDisconnect(ex)) {
        log.info("SSE会话连接已由客户端断开 tenantId={} userId={} sessionId={} error={}",
            tenantId, userId, sessionId, ex.getMessage());
      } else {
        log.warn("SSE会话连接异常 tenantId={} userId={} sessionId={} error={}",
            tenantId, userId, sessionId, ex.getMessage());
      }
      remove(tenantId, userId, sessionId);
    });
  }

  public void remove(long tenantId, long userId, String sessionId) {
    String key = key(tenantId, userId, sessionId);
    emitterMap.remove(key);
    log.info("SSE会话连接已移除 tenantId={} userId={} sessionId={}", tenantId, userId, sessionId);
  }

  public void sendForceLogout(long tenantId, long userId, String sessionId, String message) {
    SseEmitter emitter = emitterMap.get(key(tenantId, userId, sessionId));
    if (emitter == null) {
      log.info("SSE未找到待踢下线连接 tenantId={} userId={} sessionId={}", tenantId, userId, sessionId);
      return;
    }
    try {
      emitter.send(SseEmitter.event()
          .name("session")
          .data(new UserSessionEvent("FORCE_LOGOUT", sessionId, message, Instant.now(clock).toString())));
      log.info("已发送FORCE_LOGOUT tenantId={} userId={} sessionId={}", tenantId, userId, sessionId);
    } catch (Exception ex) {
      if (isClientDisconnect(ex)) {
        log.info("发送FORCE_LOGOUT时检测到客户端已断开 tenantId={} userId={} sessionId={} error={}",
            tenantId, userId, sessionId, ex.getMessage());
        emitter.complete();
      } else {
        log.warn("发送FORCE_LOGOUT失败 tenantId={} userId={} sessionId={} error={}",
            tenantId, userId, sessionId, ex.getMessage());
        emitter.completeWithError(ex);
      }
      remove(tenantId, userId, sessionId);
    }
  }

  @Scheduled(fixedDelay = 25000L, initialDelay = 25000L)
  public void broadcastPing() {
    if (emitterMap.isEmpty()) {
      return;
    }
    List<String> toRemove = new ArrayList<>();
    int[] clientDisconnectCount = new int[1];
    int[] unexpectedFailureCount = new int[1];
    UserSessionEvent ping = new UserSessionEvent("PING", "", "连接保持中", Instant.now(clock).toString());
    emitterMap.forEach((key, emitter) -> {
      try {
        emitter.send(SseEmitter.event().name("session").data(ping));
      } catch (Exception ex) {
        toRemove.add(key);
        if (isClientDisconnect(ex)) {
          clientDisconnectCount[0] += 1;
        } else {
          unexpectedFailureCount[0] += 1;
          log.warn("SSE心跳发送失败 key={} errorType={} error={}",
              key, ex.getClass().getSimpleName(), ex.getMessage());
        }
      }
    });
    for (String key : toRemove) {
      emitterMap.remove(key);
    }
    if (clientDisconnectCount[0] > 0) {
      log.info("SSE心跳清理客户端已断开连接数量={}", clientDisconnectCount[0]);
    }
    if (unexpectedFailureCount[0] > 0) {
      log.warn("SSE心跳清理异常连接数量={}", unexpectedFailureCount[0]);
    }
  }

  private boolean isClientDisconnect(Throwable throwable) {
    Throwable current = throwable;
    while (current != null) {
      String simpleName = current.getClass().getSimpleName();
      if ("ClientAbortException".equals(simpleName) || "AsyncRequestNotUsableException".equals(simpleName)) {
        return true;
      }
      String message = current.getMessage();
      if (message != null) {
        String normalizedMessage = message.toLowerCase(Locale.ROOT);
        for (String keyword : CLIENT_DISCONNECT_MESSAGES) {
          if (normalizedMessage.contains(keyword.toLowerCase(Locale.ROOT))) {
            return true;
          }
        }
      }
      current = current.getCause();
    }
    return false;
  }

  private String key(long tenantId, long userId, String sessionId) {
    return tenantId + ":" + userId + ":" + sessionId;
  }

  public record UserSessionEvent(String eventType, String sessionId, String message, String occurredAt) {
  }
}
