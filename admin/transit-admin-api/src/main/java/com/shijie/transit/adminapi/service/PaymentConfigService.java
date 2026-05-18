package com.shijie.transit.adminapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.PaymentConfigEntity;
import com.shijie.transit.common.mapper.PaymentConfigMapper;
import com.shijie.transit.common.tenant.TenantContext;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class PaymentConfigService {
  private final PaymentConfigMapper paymentConfigMapper;

  public PaymentConfigService(PaymentConfigMapper paymentConfigMapper) {
    this.paymentConfigMapper = paymentConfigMapper;
  }

  public List<PaymentConfigEntity> listAll() {
    return paymentConfigMapper.selectList(new LambdaQueryWrapper<>());
  }

  public PaymentConfigEntity getByMethod(String method) {
    return paymentConfigMapper.selectOne(
        new LambdaQueryWrapper<PaymentConfigEntity>().eq(PaymentConfigEntity::getMethod, method));
  }

  @Transactional
  public PaymentConfigEntity upsert(String method, Boolean enabled, String configJson) {
    String normalizedMethod = normalizeMethod(method);
    PaymentConfigEntity existing =
        paymentConfigMapper.selectOne(
            new LambdaQueryWrapper<PaymentConfigEntity>().eq(PaymentConfigEntity::getMethod, normalizedMethod));
    if (existing == null) {
      PaymentConfigEntity entity = new PaymentConfigEntity();
      entity.setTenantId(TenantContext.getTenantId());
      entity.setMethod(normalizedMethod);
      entity.setEnabled(enabled != null ? enabled : Boolean.TRUE);
      entity.setConfigJson(configJson != null ? configJson : "{}");
      paymentConfigMapper.insert(entity);
      return entity;
    }
    if (enabled != null) {
      existing.setEnabled(enabled);
    }
    if (configJson != null) {
      existing.setConfigJson(configJson);
    }
    paymentConfigMapper.updateById(existing);
    return existing;
  }

  private String normalizeMethod(String method) {
    if (!StringUtils.hasText(method)) {
      throw new IllegalArgumentException("method required");
    }
    String m = method.trim().toUpperCase();
    if (!List.of("WECHAT", "ALIPAY", "BANK").contains(m)) {
      throw new IllegalArgumentException("Unsupported method: " + method);
    }
    return m;
  }
}
