package com.shijie.transit.adminapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shijie.transit.common.db.entity.InvitationCodeEntity;
import com.shijie.transit.common.db.mapper.InvitationCodeMapper;
import com.shijie.transit.common.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class InvitationCodeService {

    private final InvitationCodeMapper invitationCodeMapper;

    public InvitationCodeService(InvitationCodeMapper invitationCodeMapper) {
        this.invitationCodeMapper = invitationCodeMapper;
    }

    public IPage<InvitationCodeEntity> page(Page<InvitationCodeEntity> page, String code, String channel) {
        LambdaQueryWrapper<InvitationCodeEntity> queryWrapper = new LambdaQueryWrapper<>();
        if (code != null && !code.isEmpty()) {
            queryWrapper.like(InvitationCodeEntity::getCode, code);
        }
        if (channel != null && !channel.isEmpty()) {
            queryWrapper.like(InvitationCodeEntity::getChannel, channel);
        }
        queryWrapper.orderByDesc(InvitationCodeEntity::getCreatedAt);
        return invitationCodeMapper.selectPage(page, queryWrapper);
    }

    @Transactional
    public List<InvitationCodeEntity> create(int count, Integer type, Long planId, Integer duration, String durationUnit,
                                             Integer points, Integer totalCount, String channel,
                                             LocalDateTime startTime, LocalDateTime endTime) {
        List<InvitationCodeEntity> list = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            InvitationCodeEntity entity = new InvitationCodeEntity();
            entity.setCode(generateCode());
            entity.setType(type);
            entity.setPlanId(planId);
            entity.setDuration(duration);
            entity.setDurationUnit(durationUnit);
            entity.setPoints(points);
            entity.setTotalCount(totalCount != null ? totalCount : 1);
            entity.setUsedCount(0);
            entity.setChannel(channel);
            entity.setStartTime(startTime);
            entity.setEndTime(endTime);
            entity.setTenantId(TenantContext.getTenantId());
            
            invitationCodeMapper.insert(entity);
            list.add(entity);
        }
        return list;
    }

    @Transactional
    public void update(Long id, Long planId, Integer duration, String durationUnit, Integer points,
                       Integer totalCount, String channel, LocalDateTime startTime, LocalDateTime endTime) {
        InvitationCodeEntity entity = invitationCodeMapper.selectById(id);
        if (entity == null) {
            throw new IllegalArgumentException("Invitation code not found");
        }
        // Code and Type cannot be edited
        if (planId != null) entity.setPlanId(planId);
        if (duration != null) entity.setDuration(duration);
        if (durationUnit != null) entity.setDurationUnit(durationUnit);
        if (points != null) entity.setPoints(points);
        if (totalCount != null) entity.setTotalCount(totalCount);
        if (channel != null) entity.setChannel(channel);
        if (startTime != null) entity.setStartTime(startTime);
        if (endTime != null) entity.setEndTime(endTime);

        invitationCodeMapper.updateById(entity);
    }

    @Transactional
    public void delete(Long id) {
        invitationCodeMapper.deleteById(id);
    }

    private String generateCode() {
        return "INV" + UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
    }
}
