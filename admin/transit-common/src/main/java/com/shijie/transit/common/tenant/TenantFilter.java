package com.shijie.transit.common.tenant;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import com.shijie.transit.common.web.ApiErrorWriter;
import com.shijie.transit.common.web.ErrorCode;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class TenantFilter extends OncePerRequestFilter {
  private final TenantProperties tenantProperties;
  private final ApiErrorWriter apiErrorWriter;

  public TenantFilter(TenantProperties tenantProperties, ApiErrorWriter apiErrorWriter) {
    this.tenantProperties = tenantProperties;
    this.apiErrorWriter = apiErrorWriter;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String requestUri = request.getRequestURI();
    boolean ignored = tenantProperties.getIgnoredPathPrefixes().stream().anyMatch(requestUri::startsWith);
    if (ignored) {
      filterChain.doFilter(request, response);
      return;
    }

    String rawTenantId = request.getHeader(tenantProperties.getHeaderName());
    if (!StringUtils.hasText(rawTenantId)) {
      apiErrorWriter.write(response, ErrorCode.TENANT_ID_REQUIRED, "Missing tenant header: " + tenantProperties.getHeaderName());
      return;
    }

    Long tenantId;
    try {
      tenantId = Long.parseLong(rawTenantId.trim());
    } catch (NumberFormatException ex) {
      apiErrorWriter.write(response, ErrorCode.TENANT_ID_INVALID, "Invalid tenant id: " + rawTenantId);
      return;
    }

    TenantContext.setTenantId(tenantId);
    try {
      filterChain.doFilter(request, response);
    } finally {
      TenantContext.clear();
    }
  }
}
