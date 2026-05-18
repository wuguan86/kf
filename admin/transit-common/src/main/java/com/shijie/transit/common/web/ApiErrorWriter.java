package com.shijie.transit.common.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

@Component
public class ApiErrorWriter {
  private final ObjectMapper objectMapper;
  private final Clock clock;

  public ApiErrorWriter(ObjectMapper objectMapper, Clock clock) {
    this.objectMapper = objectMapper;
    this.clock = clock;
  }

  public void write(HttpServletResponse response, ErrorCode errorCode, String message) throws IOException {
    response.setStatus(errorCode.httpStatus());
    response.setCharacterEncoding(StandardCharsets.UTF_8.name());
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    Result<Void> body = Result.error(errorCode, message, clock.millis(), null);
    response.getWriter().write(objectMapper.writeValueAsString(body));
  }
}
