package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import com.shijie.transit.common.db.entity.CrmFollowUpRecordEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.dto.SmartSalesDto;
import com.shijie.transit.userapi.mapper.CrmCustomerMapper;
import com.shijie.transit.userapi.mapper.CrmFollowUpRecordMapper;
import com.shijie.transit.userapi.vo.SmartSalesVo.FollowUpView;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 智能销售跟进记录服务。跟进记录只作为人工销售时间线，不直接触发微信发送。
 */
@Service
public class SmartSalesFollowUpService {
  private static final Logger log = LoggerFactory.getLogger(SmartSalesFollowUpService.class);
  private static final int FOLLOW_UP_TIMELINE_LIMIT = 50;

  private final CrmCustomerMapper customerMapper;
  private final CrmFollowUpRecordMapper followUpMapper;
  private final SmartSalesCustomerAccess customerAccess;

  public SmartSalesFollowUpService(
      CrmCustomerMapper customerMapper,
      CrmFollowUpRecordMapper followUpMapper,
      SmartSalesCustomerAccess customerAccess) {
    this.customerMapper = customerMapper;
    this.followUpMapper = followUpMapper;
    this.customerAccess = customerAccess;
  }

  @Transactional
  public FollowUpView createFollowUp(
      Long ownerUserId, String contactKey, SmartSalesDto.CreateFollowUpRequest req) {
    if (req == null || !StringUtils.hasText(req.content())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "跟进内容不能为空");
    }
    if (StringUtils.hasText(req.followUpType())
        && !SmartSalesConstants.VALID_FOLLOW_UP_TYPES.contains(req.followUpType())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "跟进类型不合法");
    }
    Long tenantId = TenantContext.getTenantId();
    CrmCustomerEntity customer = customerAccess.ensureCustomer(tenantId, ownerUserId, contactKey.trim());
    CrmFollowUpRecordEntity entity = new CrmFollowUpRecordEntity();
    entity.setTenantId(tenantId);
    entity.setOwnerUserId(ownerUserId);
    entity.setCustomerId(customer.getId());
    entity.setContent(req.content().trim());
    entity.setFollowUpType(StringUtils.hasText(req.followUpType()) ? req.followUpType() : "WECHAT");
    entity.setNextFollowUpAt(req.nextFollowUpAt());
    entity.setAiSuggested(req.aiSuggested() != null && req.aiSuggested() == 1 ? 1 : 0);
    followUpMapper.insert(entity);

    if (req.nextFollowUpAt() != null) {
      customer.setNextFollowUpAt(req.nextFollowUpAt());
      customerMapper.updateById(customer);
    }
    log.info("新增智能销售跟进记录 tenantId={} userId={} contactKey={} followUpId={}",
        tenantId, ownerUserId, contactKey, entity.getId());
    return toView(entity);
  }

  @Transactional
  public void deleteFollowUp(Long ownerUserId, String contactKey, Long followUpId) {
    if (!StringUtils.hasText(contactKey) || followUpId == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "参数不合法");
    }
    Long tenantId = TenantContext.getTenantId();
    CrmCustomerEntity customer = customerAccess.findCustomer(tenantId, ownerUserId, contactKey.trim());
    if (customer == null) {
      return;
    }
    followUpMapper.delete(new LambdaQueryWrapper<CrmFollowUpRecordEntity>()
        .eq(CrmFollowUpRecordEntity::getTenantId, tenantId)
        .eq(CrmFollowUpRecordEntity::getOwnerUserId, ownerUserId)
        .eq(CrmFollowUpRecordEntity::getCustomerId, customer.getId())
        .eq(CrmFollowUpRecordEntity::getId, followUpId));
  }

  List<FollowUpView> loadFollowUps(Long tenantId, Long customerId) {
    return followUpMapper.selectList(new LambdaQueryWrapper<CrmFollowUpRecordEntity>()
            .eq(CrmFollowUpRecordEntity::getTenantId, tenantId)
            .eq(CrmFollowUpRecordEntity::getCustomerId, customerId)
            .orderByDesc(CrmFollowUpRecordEntity::getCreatedAt)
            .last("limit " + FOLLOW_UP_TIMELINE_LIMIT))
        .stream()
        .map(this::toView)
        .toList();
  }

  private FollowUpView toView(CrmFollowUpRecordEntity entity) {
    return new FollowUpView(
        entity.getId(),
        entity.getContent(),
        entity.getFollowUpType(),
        entity.getAiSuggested(),
        entity.getNextFollowUpAt(),
        entity.getCreatedAt());
  }
}
