package com.shijie.transit.common.web;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 全局异常处理器
 * <p>
 * 统一捕获并处理 Controller 层抛出的各类异常，
 * 将其转换为标准的 {@link Result} 格式返回给前端。
 * </p>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
  private static final List<String> CLIENT_DISCONNECT_MESSAGES = List.of(
      "broken pipe",
      "connection reset",
      "an established connection was aborted by the software in your host machine",
      "an existing connection was forcibly closed by the remote host",
      "你的主机中的软件中止了一个已建立的连接",
      "远程主机强迫关闭了一个现有的连接");
  private final Clock clock;

  public GlobalExceptionHandler(Clock clock) {
    this.clock = clock;
  }

  @ExceptionHandler(TransitException.class)
  public ResponseEntity<Result<Void>> handleTransitException(TransitException ex, HttpServletRequest request) {
    ErrorCode errorCode = ex.getErrorCode();
    log.error("TransitException path={} code={} message={}", request.getRequestURI(), errorCode, ex.getMessage(), ex);
    Result<Void> body = Result.error(errorCode, ex.getMessage(), clock.millis(), null);
    return ResponseEntity.status(errorCode.httpStatus()).body(body);
  }

  @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
  public ResponseEntity<Result<Void>> handleValidation(Exception ex) {
    String message = null;
    if (ex instanceof MethodArgumentNotValidException manv) {
      message = firstFieldErrorMessage(manv.getBindingResult().getFieldError());
    } else if (ex instanceof BindException be) {
      message = firstFieldErrorMessage(be.getBindingResult().getFieldError());
    }
    log.warn("ValidationException message={}", message, ex);
    Result<Void> body = Result.error(ErrorCode.VALIDATION_ERROR, message, clock.millis(), null);
    return ResponseEntity.status(ErrorCode.VALIDATION_ERROR.httpStatus()).body(body);
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<Result<Void>> handleIllegalArgument(IllegalArgumentException ex) {
    log.warn("IllegalArgumentException message={}", ex.getMessage(), ex);
    Result<Void> body = Result.error(ErrorCode.BAD_REQUEST, ex.getMessage(), clock.millis(), null);
    return ResponseEntity.status(ErrorCode.BAD_REQUEST.httpStatus()).body(body);
  }

  @ExceptionHandler(AuthenticationException.class)
  public ResponseEntity<Result<Void>> handleAuthentication(AuthenticationException ex) {
    log.warn("AuthenticationException message={}", ex.getMessage(), ex);
    Result<Void> body = Result.error(ErrorCode.UNAUTHORIZED, ex.getMessage(), clock.millis(), null);
    return ResponseEntity.status(ErrorCode.UNAUTHORIZED.httpStatus()).body(body);
  }

  @ExceptionHandler(AccessDeniedException.class)
  public ResponseEntity<Result<Void>> handleAccessDenied(AccessDeniedException ex) {
    log.warn("AccessDeniedException message={}", ex.getMessage(), ex);
    Result<Void> body = Result.error(ErrorCode.FORBIDDEN, ex.getMessage(), clock.millis(), null);
    return ResponseEntity.status(ErrorCode.FORBIDDEN.httpStatus()).body(body);
  }

  @ExceptionHandler(AsyncRequestTimeoutException.class)
  public ResponseEntity<Void> handleAsyncRequestTimeout(AsyncRequestTimeoutException ex, HttpServletRequest request) {
    log.warn("AsyncRequestTimeoutException path={} message={}", request.getRequestURI(), ex.getMessage(), ex);
    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<?> handleOther(Exception ex, HttpServletRequest request) {
    if (isClientDisconnect(ex)) {
      log.info("客户端已主动断开连接 path={} message={}", request.getRequestURI(), ex.getMessage());
      return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }
    log.error("UnhandledException message={}", ex.getMessage(), ex);
    Result<Void> body =
        Result.error(ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR.getReasonPhrase(), clock.millis(), null);
    return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.httpStatus()).body(body);
  }

  private String firstFieldErrorMessage(FieldError fieldError) {
    return Optional.ofNullable(fieldError).map(FieldError::getDefaultMessage).orElse(null);
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
}
