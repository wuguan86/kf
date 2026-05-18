package com.shijie.transit.common.tenant;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "transit.tenant")
public class TenantProperties {
  private String headerName = "X-Tenant-Id";
  private List<String> ignoredPathPrefixes = new ArrayList<>(List.of("/actuator", "/api/user/auth"));

  public String getHeaderName() {
    return headerName;
  }

  public void setHeaderName(String headerName) {
    this.headerName = headerName;
  }

  public List<String> getIgnoredPathPrefixes() {
    return ignoredPathPrefixes;
  }

  public void setIgnoredPathPrefixes(List<String> ignoredPathPrefixes) {
    this.ignoredPathPrefixes = ignoredPathPrefixes;
  }
}
