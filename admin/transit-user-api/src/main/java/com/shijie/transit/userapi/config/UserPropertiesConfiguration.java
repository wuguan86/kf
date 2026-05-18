package com.shijie.transit.userapi.config;

import com.shijie.transit.userapi.dify.DifyProperties;
import com.shijie.transit.userapi.wechat.WeChatMpProperties;
import com.shijie.transit.userapi.wechat.WeChatOpenProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({WeChatOpenProperties.class, WeChatMpProperties.class, DifyProperties.class})
public class UserPropertiesConfiguration {
}
