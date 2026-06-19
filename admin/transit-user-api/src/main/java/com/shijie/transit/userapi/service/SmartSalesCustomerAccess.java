package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import com.shijie.transit.common.db.entity.UserIntentEntity;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.mapper.CrmCustomerMapper;
import com.shijie.transit.userapi.mapper.UserIntentDailySnapshotMapper;
import com.shijie.transit.userapi.mapper.UserIntentMapper;
import java.time.LocalDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 智能销售客户基础访问能力。只负责按租户、归属人和微信联系人定位客户。
 */
@Service
public class SmartSalesCustomerAccess {
  private static final Logger log = LoggerFactory.getLogger(SmartSalesCustomerAccess.class);

  private final CrmCustomerMapper customerMapper;
  private final UserIntentMapper userIntentMapper;
  private final UserIntentDailySnapshotMapper userIntentDailySnapshotMapper;

  public SmartSalesCustomerAccess(
      CrmCustomerMapper customerMapper,
      UserIntentMapper userIntentMapper,
      UserIntentDailySnapshotMapper userIntentDailySnapshotMapper) {
    this.customerMapper = customerMapper;
    this.userIntentMapper = userIntentMapper;
    this.userIntentDailySnapshotMapper = userIntentDailySnapshotMapper;
  }

  CrmCustomerEntity findCustomer(Long tenantId, Long ownerUserId, String contactKey) {
    return customerMapper.selectOne(new LambdaQueryWrapper<CrmCustomerEntity>()
        .eq(CrmCustomerEntity::getTenantId, tenantId)
        .eq(CrmCustomerEntity::getOwnerUserId, ownerUserId)
        .eq(CrmCustomerEntity::getContactKey, contactKey)
        .last("limit 1"));
  }

  CrmCustomerEntity ensureCustomer(Long tenantId, Long ownerUserId, String contactKey) {
    CrmCustomerEntity existing = findCustomer(tenantId, ownerUserId, contactKey);
    if (existing != null) {
      return existing;
    }
    CrmCustomerEntity entity = new CrmCustomerEntity();
    entity.setTenantId(tenantId);
    entity.setOwnerUserId(ownerUserId);
    entity.setContactKey(contactKey);
    entity.setRemarkName(null);
    entity.setPhone("");
    entity.setSource("UNKNOWN");
    entity.setStage("LEAD");
    entity.setStarred(0);
    customerMapper.insert(entity);
    log.info("自动建档 tenantId={} userId={} contactKey={} customerId={}",
        tenantId, ownerUserId, contactKey, entity.getId());
    return entity;
  }

  UserIntentEntity getIntent(Long tenantId, Long ownerUserId, String contactKey) {
    return userIntentMapper.selectOne(new LambdaQueryWrapper<UserIntentEntity>()
        .eq(UserIntentEntity::getTenantId, tenantId)
        .eq(UserIntentEntity::getOwnerUserId, ownerUserId)
        .eq(UserIntentEntity::getContactKey, contactKey)
        .last("limit 1"));
  }

  LocalDateTime findLastChatTime(Long tenantId, Long ownerUserId, String contactKey) {
    return userIntentDailySnapshotMapper.findLatestChatTime(tenantId, ownerUserId, contactKey);
  }

  void validateIntentLevel(Integer intentLevel) {
    if (intentLevel == null) {
      return;
    }
    if (intentLevel != 1 && intentLevel != 2 && intentLevel != 3) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "意向度参数不合法");
    }
  }

  void validateStage(String stage) {
    if (!StringUtils.hasText(stage)) {
      return;
    }
    if (!SmartSalesConstants.STAGE_ORDER.contains(stage)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "商机阶段不合法");
    }
  }

  void validateSource(String source) {
    if (!StringUtils.hasText(source)) {
      return;
    }
    if (!SmartSalesConstants.VALID_SOURCES.contains(source)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "客户来源不合法");
    }
  }

  String toIntentLabel(Integer intentLevel) {
    if (intentLevel == null) {
      return "未知";
    }
    return switch (intentLevel) {
      case 3 -> "高意向";
      case 2 -> "中意向";
      case 1 -> "低意向";
      default -> "未知";
    };
  }

  int toInt(Long value) {
    return value == null ? 0 : value.intValue();
  }
}
