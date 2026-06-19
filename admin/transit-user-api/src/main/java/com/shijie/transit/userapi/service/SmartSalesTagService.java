package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import com.shijie.transit.common.db.entity.CrmCustomerTagEntity;
import com.shijie.transit.common.db.entity.CrmCustomerTagRelEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.dto.SmartSalesDto;
import com.shijie.transit.userapi.mapper.CrmCustomerMapper;
import com.shijie.transit.userapi.mapper.CrmCustomerTagMapper;
import com.shijie.transit.userapi.mapper.CrmCustomerTagRelMapper;
import com.shijie.transit.userapi.mapper.CrmCustomerTagRelMapper.CustomerTagProjection;
import com.shijie.transit.userapi.vo.SmartSalesVo.TagView;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 智能销售客户标签服务。预设标签使用 tenant_id=0 / owner_user_id=0 作为全局只读标签。
 */
@Service
public class SmartSalesTagService {
  private static final Logger log = LoggerFactory.getLogger(SmartSalesTagService.class);

  private final CrmCustomerMapper customerMapper;
  private final CrmCustomerTagMapper tagMapper;
  private final CrmCustomerTagRelMapper tagRelMapper;

  public SmartSalesTagService(
      CrmCustomerMapper customerMapper,
      CrmCustomerTagMapper tagMapper,
      CrmCustomerTagRelMapper tagRelMapper) {
    this.customerMapper = customerMapper;
    this.tagMapper = tagMapper;
    this.tagRelMapper = tagRelMapper;
  }

  public List<TagView> listTags(Long ownerUserId) {
    Long tenantId = TenantContext.getTenantId();
    LambdaQueryWrapper<CrmCustomerTagEntity> query = new LambdaQueryWrapper<CrmCustomerTagEntity>()
        .and(w -> w
            .eq(CrmCustomerTagEntity::getTenantId, tenantId)
            .eq(CrmCustomerTagEntity::getOwnerUserId, ownerUserId)
            .or()
            .eq(CrmCustomerTagEntity::getTenantId, 0L)
            .eq(CrmCustomerTagEntity::getOwnerUserId, 0L)
            .eq(CrmCustomerTagEntity::getCategory, "PRESET"))
        .orderByAsc(CrmCustomerTagEntity::getCategory)
        .orderByAsc(CrmCustomerTagEntity::getId);
    return tagMapper.selectList(query).stream()
        .map(e -> new TagView(e.getId(), e.getName(), e.getColor(), e.getCategory()))
        .toList();
  }

  @Transactional
  public TagView createTag(Long ownerUserId, SmartSalesDto.CreateTagRequest req) {
    if (req == null || !StringUtils.hasText(req.name())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "标签名称不能为空");
    }
    Long tenantId = TenantContext.getTenantId();
    String name = req.name().trim();
    Long existCount = tagMapper.selectCount(new LambdaQueryWrapper<CrmCustomerTagEntity>()
        .eq(CrmCustomerTagEntity::getTenantId, tenantId)
        .eq(CrmCustomerTagEntity::getOwnerUserId, ownerUserId)
        .eq(CrmCustomerTagEntity::getName, name));
    if (existCount != null && existCount > 0) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "标签名称已存在");
    }
    CrmCustomerTagEntity entity = new CrmCustomerTagEntity();
    entity.setTenantId(tenantId);
    entity.setOwnerUserId(ownerUserId);
    entity.setName(name);
    entity.setColor(StringUtils.hasText(req.color()) ? req.color().trim() : "#5B8FF9");
    entity.setCategory("CUSTOM");
    tagMapper.insert(entity);
    log.info("新建智能销售标签 tenantId={} userId={} tagId={} name={}",
        tenantId, ownerUserId, entity.getId(), name);
    return new TagView(entity.getId(), entity.getName(), entity.getColor(), entity.getCategory());
  }

  @Transactional
  public List<TagView> updateCustomerTags(
      Long ownerUserId, String contactKey, SmartSalesDto.UpdateCustomerTagsRequest req) {
    if (!StringUtils.hasText(contactKey)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "contactKey 不能为空");
    }
    Long tenantId = TenantContext.getTenantId();
    CrmCustomerEntity customer = ensureCustomerExists(tenantId, ownerUserId, contactKey.trim());
    List<Long> addIds = req == null || req.addTagIds() == null ? List.of() : req.addTagIds();
    List<Long> removeIds = req == null || req.removeTagIds() == null ? List.of() : req.removeTagIds();

    if (!addIds.isEmpty()) {
      Set<Long> existing = new HashSet<>(tagRelMapper.findTagIdsByCustomer(tenantId, customer.getId()));
      for (Long tagId : addIds) {
        if (tagId == null || existing.contains(tagId)) {
          continue;
        }
        validateTagAccess(tenantId, ownerUserId, tagId);
        CrmCustomerTagRelEntity rel = new CrmCustomerTagRelEntity();
        rel.setTenantId(tenantId);
        rel.setCustomerId(customer.getId());
        rel.setTagId(tagId);
        tagRelMapper.insert(rel);
      }
    }
    for (Long tagId : removeIds) {
      if (tagId == null) {
        continue;
      }
      tagRelMapper.delete(new LambdaQueryWrapper<CrmCustomerTagRelEntity>()
          .eq(CrmCustomerTagRelEntity::getTenantId, tenantId)
          .eq(CrmCustomerTagRelEntity::getCustomerId, customer.getId())
          .eq(CrmCustomerTagRelEntity::getTagId, tagId));
    }
    return loadTagsOfCustomer(tenantId, customer.getId());
  }

  List<TagView> loadTagsOfCustomer(Long tenantId, Long customerId) {
    return batchLoadTags(tenantId, List.of(customerId)).getOrDefault(customerId, List.of());
  }

  Map<Long, List<TagView>> batchLoadTags(Long tenantId, List<Long> customerIds) {
    if (customerIds.isEmpty()) {
      return Collections.emptyMap();
    }
    List<CustomerTagProjection> projections = tagRelMapper.findTagsByCustomers(tenantId, customerIds);
    Map<Long, List<TagView>> result = new HashMap<>();
    for (CustomerTagProjection p : projections) {
      if (p.getCustomerId() == null || p.getTagId() == null) {
        continue;
      }
      TagView view = new TagView(p.getTagId(), p.getTagName(), p.getTagColor(), p.getTagCategory());
      result.computeIfAbsent(p.getCustomerId(), k -> new ArrayList<>()).add(view);
    }
    return result;
  }

  private void validateTagAccess(Long tenantId, Long ownerUserId, Long tagId) {
    CrmCustomerTagEntity tag = tagMapper.selectById(tagId);
    if (tag == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "标签不存在");
    }
    boolean presetTag = Long.valueOf(0L).equals(tag.getTenantId())
        && Long.valueOf(0L).equals(tag.getOwnerUserId())
        && "PRESET".equals(tag.getCategory());
    boolean ownedCustomTag = tenantId.equals(tag.getTenantId())
        && ownerUserId.equals(tag.getOwnerUserId())
        && "CUSTOM".equals(tag.getCategory());
    if (!presetTag && !ownedCustomTag) {
      throw new TransitException(ErrorCode.FORBIDDEN, "无权使用该标签");
    }
  }

  private CrmCustomerEntity ensureCustomerExists(Long tenantId, Long ownerUserId, String contactKey) {
    CrmCustomerEntity existing = customerMapper.selectOne(new LambdaQueryWrapper<CrmCustomerEntity>()
        .eq(CrmCustomerEntity::getTenantId, tenantId)
        .eq(CrmCustomerEntity::getOwnerUserId, ownerUserId)
        .eq(CrmCustomerEntity::getContactKey, contactKey)
        .last("limit 1"));
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
    log.info("打标触发自动建档 tenantId={} userId={} contactKey={} customerId={}",
        tenantId, ownerUserId, contactKey, entity.getId());
    return entity;
  }
}
