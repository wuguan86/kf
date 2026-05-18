package com.shijie.transit.common.security;

public interface UserSessionValidator {
  boolean isSessionValid(long tenantId, long userId, String sessionId);
}
