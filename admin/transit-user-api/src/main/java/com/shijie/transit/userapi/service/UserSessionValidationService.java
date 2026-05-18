package com.shijie.transit.userapi.service;

import com.shijie.transit.common.security.UserSessionValidator;
import org.springframework.stereotype.Service;

@Service
public class UserSessionValidationService implements UserSessionValidator {
  private final UserSessionService userSessionService;

  public UserSessionValidationService(UserSessionService userSessionService) {
    this.userSessionService = userSessionService;
  }

  @Override
  public boolean isSessionValid(long tenantId, long userId, String sessionId) {
    return userSessionService.isCurrentOnlineSession(tenantId, userId, sessionId);
  }
}
