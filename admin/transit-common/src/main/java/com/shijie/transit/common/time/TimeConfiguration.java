package com.shijie.transit.common.time;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class TimeConfiguration {
  @Bean
  public Clock clock() {
    return Clock.system(ZoneId.of("Asia/Shanghai"));
  }
}
