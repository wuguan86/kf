package com.shijie.transit.common.tenant;

public final class TenantContext {
  private static final ThreadLocal<Long> TENANT_ID = new ThreadLocal<>();

  private TenantContext() {
  }

  public static Long getTenantId() {
    return TENANT_ID.get();
  }

  public static void setTenantId(Long tenantId) {
    TENANT_ID.set(tenantId);
  }

  public static void clear() {
    TENANT_ID.remove();
  }
}
