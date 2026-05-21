package com.shijie.transit.userapi.enterprisewechat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.mapper.EnterpriseWeChatMessageMapper;
import com.shijie.transit.common.mapper.EnterpriseWeChatUserBindingMapper;
import java.time.Clock;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

class EnterpriseWeChatMessageServiceContextTest {
  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner().withUserConfiguration(TestConfiguration.class);

  @Test
  void contextCreatesEnterpriseWeChatMessageServiceWithAutowiredConstructor() {
    contextRunner.run(context ->
        assertThat(context).hasSingleBean(EnterpriseWeChatMessageService.class));
  }

  @Configuration
  @Import(EnterpriseWeChatMessageService.class)
  static class TestConfiguration {
    @Bean
    EnterpriseWeChatMessageMapper enterpriseWeChatMessageMapper() {
      return mock(EnterpriseWeChatMessageMapper.class);
    }

    @Bean
    EnterpriseWeChatUserBindingMapper enterpriseWeChatUserBindingMapper() {
      return mock(EnterpriseWeChatUserBindingMapper.class);
    }

    @Bean
    Clock clock() {
      return Clock.systemUTC();
    }

    @Bean
    ObjectMapper objectMapper() {
      return new ObjectMapper();
    }
  }
}
