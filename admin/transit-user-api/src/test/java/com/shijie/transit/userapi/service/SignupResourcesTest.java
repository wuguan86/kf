package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.shijie.transit.common.db.entity.PointsLedgerEntity;
import com.shijie.transit.common.db.entity.UserMembershipEntity;
import com.shijie.transit.common.mapper.MembershipPlanMapper;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.mapper.PointsLedgerMapper;
import com.shijie.transit.userapi.mapper.RoleMapper;
import com.shijie.transit.userapi.mapper.UserMembershipMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class SignupResourcesTest {
  @AfterEach
  void clearTenant() {
    TenantContext.clear();
  }

  @Test
  void signupPointsHaveLedgerExpiryAndCanBeConsumedWithoutPaidPlan() {
    TenantContext.setTenantId(9L);
    var membershipMapper = mock(UserMembershipMapper.class);
    var ledgerMapper = mock(PointsLedgerMapper.class);
    var planMapper = mock(MembershipPlanMapper.class);
    Clock clock = Clock.fixed(Instant.parse("2026-09-14T00:00:00Z"), ZoneOffset.UTC);
    var service = new MembershipEntitlementService(planMapper, membershipMapper, ledgerMapper, clock);
    when(membershipMapper.insert(any(UserMembershipEntity.class))).thenAnswer(invocation -> {
      ((UserMembershipEntity) invocation.getArgument(0)).setId(81L);
      return 1;
    });
    service.grantSignupPoints(71L);

    var membershipCaptor = ArgumentCaptor.forClass(UserMembershipEntity.class);
    verify(membershipMapper).insert(membershipCaptor.capture());
    var membership = membershipCaptor.getValue();
    assertEquals(9L, membership.getTenantId());
    assertEquals(71L, membership.getUserId());
    assertNull(membership.getPlanId());
    assertEquals(3000, membership.getPointsBalance());
    assertEquals("active", membership.getStatus());
    assertEquals(LocalDateTime.now(clock).plusMonths(6), membership.getEndAt());

    var ledgerCaptor = ArgumentCaptor.forClass(PointsLedgerEntity.class);
    verify(ledgerMapper).insert(ledgerCaptor.capture());
    var ledger = ledgerCaptor.getValue();
    assertEquals(9L, ledger.getTenantId());
    assertEquals(71L, ledger.getUserId());
    assertEquals(3000, ledger.getDelta());
    assertEquals(3000, ledger.getBalanceAfter());
    assertEquals("新用户注册赠送", ledger.getReason());
    assertEquals("signup:71:81", ledger.getRefId());

    when(membershipMapper.selectList(any())).thenAnswer(invocation -> new java.util.ArrayList<>(List.of(membership)));
    var query = new MembershipQueryService(planMapper, membershipMapper, ledgerMapper, service, clock);
    assertEquals(3000, query.queryMyMembership(71L).packagePoints());
    assertTrue(service.deductPoints(71L, 100, "体验消耗", "test"));
    assertEquals(2900, membership.getPointsBalance());
    assertFalse(service.deductPoints(71L, 3000, "体验消耗", "test"));
  }

  @Test
  void defaultRoleIsEnabledCustomerServiceWithNoKnowledgeBaseDependency() {
    TenantContext.setTenantId(9L);
    var roleMapper = mock(RoleMapper.class);
    var service = new RoleService(roleMapper, mock(RoleKnowledgeBaseService.class));
    var role = service.createDefaultRole(71L);
    assertEquals(9L, role.getTenantId());
    assertEquals(71L, role.getUserId());
    assertEquals("默认客服", role.getName());
    assertEquals("CUSTOMER_SERVICE", role.getRoleType());
    assertEquals("RUNNING", role.getStatus());
    assertTrue(role.getContent().contains("不编造"));
    assertNull(role.getKnowledgeBaseId());
    verify(roleMapper).insert(role);
  }
}
