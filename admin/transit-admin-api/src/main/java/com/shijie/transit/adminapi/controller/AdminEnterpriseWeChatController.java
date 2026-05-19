package com.shijie.transit.adminapi.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.EnterpriseWeChatUserBindingEntity;
import com.shijie.transit.common.mapper.EnterpriseWeChatUserBindingMapper;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.web.Result;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.util.StringUtils;

@RestController
@RequestMapping("/api/admin/enterprise-wechat")
public class AdminEnterpriseWeChatController {
  private final EnterpriseWeChatUserBindingMapper bindingMapper;

  public AdminEnterpriseWeChatController(EnterpriseWeChatUserBindingMapper bindingMapper) {
    this.bindingMapper = bindingMapper;
  }

  @GetMapping("/bindings")
  public Result<List<EnterpriseWeChatUserBindingEntity>> listBindings() {
    List<EnterpriseWeChatUserBindingEntity> list = bindingMapper.selectList(
        new LambdaQueryWrapper<EnterpriseWeChatUserBindingEntity>()
            .orderByDesc(EnterpriseWeChatUserBindingEntity::getUpdatedAt));
    return Result.success(list);
  }

  @PostMapping("/bindings")
  public Result<EnterpriseWeChatUserBindingEntity> createBinding(@RequestBody EnterpriseWeChatUserBindingEntity request) {
    normalize(request);
    request.setTenantId(TenantContext.getTenantId());
    bindingMapper.insert(request);
    return Result.success(request);
  }

  @PutMapping("/bindings/{id}")
  public Result<EnterpriseWeChatUserBindingEntity> updateBinding(
      @PathVariable("id") Long id,
      @RequestBody EnterpriseWeChatUserBindingEntity request) {
    EnterpriseWeChatUserBindingEntity existing = bindingMapper.selectById(id);
    if (existing == null) {
      throw new IllegalArgumentException("企业微信映射不存在");
    }
    existing.setEnterpriseUserId(request.getEnterpriseUserId());
    existing.setEnterpriseUserName(request.getEnterpriseUserName());
    existing.setUserId(request.getUserId());
    existing.setRemark(request.getRemark());
    existing.setStatus(request.getStatus());
    normalize(existing);
    bindingMapper.updateById(existing);
    return Result.success(existing);
  }

  @DeleteMapping("/bindings/{id}")
  public Result<Void> deleteBinding(@PathVariable("id") Long id) {
    bindingMapper.deleteById(id);
    return Result.success(null);
  }

  private void normalize(EnterpriseWeChatUserBindingEntity entity) {
    if (!StringUtils.hasText(entity.getEnterpriseUserId())) {
      throw new IllegalArgumentException("企业微信 userid 不能为空");
    }
    if (entity.getUserId() == null || entity.getUserId() <= 0) {
      throw new IllegalArgumentException("系统用户ID不能为空");
    }
    entity.setEnterpriseUserId(entity.getEnterpriseUserId().trim());
    entity.setEnterpriseUserName(defaultString(entity.getEnterpriseUserName()));
    entity.setRemark(defaultString(entity.getRemark()));
    entity.setStatus("DISABLED".equalsIgnoreCase(entity.getStatus()) ? "DISABLED" : "ENABLED");
  }

  private String defaultString(String value) {
    return value == null ? "" : value.trim();
  }
}
