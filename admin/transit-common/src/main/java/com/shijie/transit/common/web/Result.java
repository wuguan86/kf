package com.shijie.transit.common.web;

/**
 * 统一 API 响应结构
 * <p>
 * 所有 HTTP 接口返回的统一包装类。
 * 包含状态码、错误信息、数据载荷、时间戳和追踪ID。
 * </p>
 *
 * @param <T> 数据载荷类型
 */
public class Result<T> {
  private int code;
  private String msg;
  private T data;
  private long timestamp;
  private String traceId;

  public Result() {
  }

  public Result(int code, String msg, T data, long timestamp, String traceId) {
    this.code = code;
    this.msg = msg;
    this.data = data;
    this.timestamp = timestamp;
    this.traceId = traceId;
  }

  public static <T> Result<T> ok(T data, long timestamp, String traceId) {
    return new Result<>(ErrorCode.OK.code(), ErrorCode.OK.defaultMessage(), data, timestamp, traceId);
  }

  public static <T> Result<T> success(T data) {
    return new Result<>(ErrorCode.OK.code(), ErrorCode.OK.defaultMessage(), data, System.currentTimeMillis(), null);
  }

  public static <T> Result<T> error(ErrorCode errorCode, String message, long timestamp, String traceId) {
    String msg = (message == null || message.isBlank()) ? errorCode.defaultMessage() : message;
    return new Result<>(errorCode.code(), msg, null, timestamp, traceId);
  }

  public int getCode() {
    return code;
  }

  public void setCode(int code) {
    this.code = code;
  }

  public String getMsg() {
    return msg;
  }

  public void setMsg(String msg) {
    this.msg = msg;
  }

  public T getData() {
    return data;
  }

  public void setData(T data) {
    this.data = data;
  }

  public long getTimestamp() {
    return timestamp;
  }

  public void setTimestamp(long timestamp) {
    this.timestamp = timestamp;
  }

  public String getTraceId() {
    return traceId;
  }

  public void setTraceId(String traceId) {
    this.traceId = traceId;
  }
}
