package com.shijie.transit.common.web;

/**
 * 统一错误码定义
 * <p>
 * 定义系统所有的业务错误码、HTTP状态码及默认错误信息。
 * </p>
 */
public enum ErrorCode {
  OK(0, 200, "OK"),

  BAD_REQUEST(40000, 400, "Bad Request"),
  VALIDATION_ERROR(40001, 400, "Validation Error"),

  UNAUTHORIZED(40100, 401, "Unauthorized"),
  FORBIDDEN(40300, 403, "Forbidden"),

  TENANT_ID_REQUIRED(41001, 400, "Tenant Id Required"),
  TENANT_ID_INVALID(41002, 400, "Tenant Id Invalid"),

  INTERNAL_ERROR(50000, 500, "Internal Error");

  private final int code;
  private final int httpStatus;
  private final String defaultMessage;

  ErrorCode(int code, int httpStatus, String defaultMessage) {
    this.code = code;
    this.httpStatus = httpStatus;
    this.defaultMessage = defaultMessage;
  }

  public int code() {
    return code;
  }

  public int httpStatus() {
    return httpStatus;
  }

  public String defaultMessage() {
    return defaultMessage;
  }
}
