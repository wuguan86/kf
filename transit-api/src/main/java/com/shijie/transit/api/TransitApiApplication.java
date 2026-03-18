package com.shijie.transit.api;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = "com.shijie.transit")
@MapperScan("com.shijie.transit.**.mapper")
@EnableScheduling
public class TransitApiApplication {
  public static void main(String[] args) {
    SpringApplication.run(TransitApiApplication.class, args);
  }
}
