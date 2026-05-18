package com.shijie.transit.common.security;

import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.web.ApiErrorWriter;
import com.shijie.transit.common.web.ErrorCode;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

public class JwtAuthenticationFilter extends OncePerRequestFilter {
  public static final String REQUEST_ATTR_SESSION_ID = "transit.sessionId";
  private final JwtService jwtService;
  private final ApiErrorWriter apiErrorWriter;
  private final UserSessionValidator userSessionValidator;
  private final String expectedType;
  private final String protectedPathPrefix;
  private final List<String> permitPathPrefixes;

  public JwtAuthenticationFilter(
      JwtService jwtService,
      ApiErrorWriter apiErrorWriter,
      UserSessionValidator userSessionValidator,
      String expectedType,
      String protectedPathPrefix,
      List<String> permitPathPrefixes) {
    this.jwtService = jwtService;
    this.apiErrorWriter = apiErrorWriter;
    this.userSessionValidator = userSessionValidator;
    this.expectedType = expectedType;
    this.protectedPathPrefix = protectedPathPrefix;
    this.permitPathPrefixes = permitPathPrefixes;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String requestUri = request.getRequestURI();
    if (!requestUri.startsWith(protectedPathPrefix)) {
      filterChain.doFilter(request, response);
      return;
    }
    boolean permitted = permitPathPrefixes.stream().anyMatch(requestUri::startsWith);
    if (permitted) {
      filterChain.doFilter(request, response);
      return;
    }

    String header = request.getHeader(HttpHeaders.AUTHORIZATION);
    if (!StringUtils.hasText(header) || !header.startsWith("Bearer ")) {
      apiErrorWriter.write(response, ErrorCode.UNAUTHORIZED, "Missing Bearer token");
      return;
    }

    String token = header.substring("Bearer ".length()).trim();
    TransitJwtClaims claims;
    try {
      claims = jwtService.parseToken(token);
    } catch (RuntimeException ex) {
      apiErrorWriter.write(response, ErrorCode.UNAUTHORIZED, "Invalid token");
      return;
    }

    if (!expectedType.equalsIgnoreCase(claims.type())) {
      apiErrorWriter.write(response, ErrorCode.UNAUTHORIZED, "Token type mismatch");
      return;
    }
    if ("USER".equalsIgnoreCase(expectedType) && userSessionValidator != null) {
      boolean valid;
      TenantContext.setTenantId(claims.tenantId());
      try {
        valid = userSessionValidator.isSessionValid(claims.tenantId(), claims.subjectId(), claims.sessionId());
      } finally {
        TenantContext.clear();
      }
      if (!valid) {
        apiErrorWriter.write(response, ErrorCode.UNAUTHORIZED, "登录会话已失效，请重新登录");
        return;
      }
    }
    request.setAttribute(REQUEST_ATTR_SESSION_ID, claims.sessionId());

    TransitPrincipal principal = new TransitPrincipal(claims.subjectId(), claims.tenantId(), claims.type());
    SimpleGrantedAuthority authority = new SimpleGrantedAuthority("ROLE_" + expectedType.toUpperCase());
    UsernamePasswordAuthenticationToken authentication =
        new UsernamePasswordAuthenticationToken(principal, null, List.of(authority));
    SecurityContextHolder.getContext().setAuthentication(authentication);
    filterChain.doFilter(request, response);
  }
}
