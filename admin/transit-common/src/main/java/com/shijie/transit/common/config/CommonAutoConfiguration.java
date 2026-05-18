package com.shijie.transit.common.config;

import com.shijie.transit.common.security.JwtProperties;
import com.shijie.transit.common.tenant.TenantProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({TenantProperties.class, JwtProperties.class})
public class CommonAutoConfiguration {
}
