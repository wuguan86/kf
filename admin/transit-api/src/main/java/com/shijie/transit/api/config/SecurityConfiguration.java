package com.shijie.transit.api.config;

import com.shijie.transit.common.security.JwtAuthenticationFilter;
import com.shijie.transit.common.security.JwtService;
import com.shijie.transit.common.security.UserSessionValidator;
import com.shijie.transit.common.web.ApiErrorWriter;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.security.config.annotation.web.configuration.WebSecurityCustomizer;
import java.util.Arrays;

@Configuration
@EnableWebSecurity
public class SecurityConfiguration {

  @Bean
  public WebSecurityCustomizer webSecurityCustomizer() {
      // Completely bypass security filters for static resources
      return (web) -> web.ignoring().requestMatchers("/static/**", "/public/**");
  }

  @Bean
  @Order(1)
  public SecurityFilterChain userSecurityFilterChain(
      HttpSecurity http,
      JwtService jwtService,
      ApiErrorWriter apiErrorWriter,
      UserSessionValidator userSessionValidator)
      throws Exception {
    JwtAuthenticationFilter jwtFilter =
        new JwtAuthenticationFilter(
            jwtService,
            apiErrorWriter,
            userSessionValidator,
            "USER",
            "/api/user",
            List.of(
                "/api/user/auth",
                "/api/user/avatar",
                "/api/user/payment/wechat/notify",
                "/api/user/system-config/image/"
            ));

    http.securityMatcher("/api/user/**");
    http.csrf(csrf -> csrf.disable());
    http.cors(cors -> cors.configurationSource(corsConfigurationSource()));
    http.sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
    http.authorizeHttpRequests(auth -> auth
        .anyRequest().permitAll());
    http.addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
    return http.build();
  }

  @Bean
  @Order(2)
  public SecurityFilterChain adminSecurityFilterChain(HttpSecurity http, JwtService jwtService, ApiErrorWriter apiErrorWriter)
      throws Exception {
    JwtAuthenticationFilter jwtFilter =
        new JwtAuthenticationFilter(jwtService, apiErrorWriter, null, "ADMIN", "/api/admin", List.of("/api/admin/auth"));

    http.securityMatcher("/api/admin/**");
    http.csrf(csrf -> csrf.disable());
    http.cors(cors -> cors.configurationSource(corsConfigurationSource()));
    http.sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
    http.authorizeHttpRequests(auth -> auth
        .anyRequest().permitAll());
    http.addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
    return http.build();
  }

  @Bean
  @Order(3)
  public SecurityFilterChain otherSecurityFilterChain(HttpSecurity http) throws Exception {
    http.securityMatcher("/**");
    http.csrf(csrf -> csrf.disable());
    http.cors(cors -> cors.configurationSource(corsConfigurationSource()));
    http.authorizeHttpRequests(auth -> auth
        .requestMatchers("/actuator/**").permitAll()
        .requestMatchers("/*.txt").permitAll()
        .anyRequest().denyAll());
    return http.build();
  }

  @Bean
  public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOriginPatterns(List.of("*")); // Allow all origins
    configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
    configuration.setAllowedHeaders(List.of("*"));
    configuration.setAllowCredentials(true);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }
}
