package com.shijie.transit.common.web;

/**
 * 系统统一业务异常
 * <p>
 * 包含错误码和错误信息。
 * 业务逻辑中遇到预期内的错误应抛出此异常。
 * </p>
 */
public class TransitException extends RuntimeException {
  private final ErrorCode errorCode;

  public TransitException(ErrorCode errorCode, String message) {
    super(message);
    this.errorCode = errorCode;
  }

  public TransitException(ErrorCode errorCode, String message, Throwable cause) {
    super(message, cause);
    this.errorCode = errorCode;
  }

  public ErrorCode getErrorCode() {
    return errorCode;
  }
}
