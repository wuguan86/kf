package com.shijie.transit.adminapi.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@MapperScan("com.shijie.transit.adminapi.mapper")
public class AdminMybatisConfiguration {
}
