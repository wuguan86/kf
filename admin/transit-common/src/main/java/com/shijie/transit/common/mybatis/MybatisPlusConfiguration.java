package com.shijie.transit.common.mybatis;

import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler;
import com.shijie.transit.common.tenant.TenantContext;

import java.util.Set;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.LongValue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MybatisPlusConfiguration {
  // private static final Set<String> IGNORED_TABLES = Set.of(
  //    "flyway_schema_history"
  // );

  @Bean
  public TenantLineHandler tenantLineHandler() {
    return new TenantLineHandler() {
      @Override
      public Expression getTenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) {
          throw new IllegalStateException("Tenant id is required but missing in TenantContext");
        }
        return new LongValue(tenantId);
      }

      @Override
      public String getTenantIdColumn() {
        return "tenant_id";
      }

      @Override
      public boolean ignoreTable(String tableName) {
        // return IGNORED_TABLES.contains(tableName);
        return false;
      }
    };
  }

  @Bean
  public MybatisPlusInterceptor mybatisPlusInterceptor(TenantLineHandler tenantLineHandler) {
    MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
    interceptor.addInnerInterceptor(new TenantLineInnerInterceptor(tenantLineHandler));
    interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
    return interceptor;
  }
}
