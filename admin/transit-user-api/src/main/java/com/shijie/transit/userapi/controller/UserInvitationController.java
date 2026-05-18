package com.shijie.transit.userapi.controller;

import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.service.InvitationRedeemService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/user/invitation")
public class UserInvitationController {
  private final InvitationRedeemService invitationRedeemService;

  public UserInvitationController(InvitationRedeemService invitationRedeemService) {
    this.invitationRedeemService = invitationRedeemService;
  }

  @PostMapping("/redeem")
  public Result<InvitationRedeemService.RedeemResult> redeem(@Valid @RequestBody RedeemRequest request) {
    TransitPrincipal principal = currentPrincipal();
    return Result.success(invitationRedeemService.redeem(principal.subjectId(), request.code()));
  }

  private TransitPrincipal currentPrincipal() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    return (TransitPrincipal) authentication.getPrincipal();
  }

  public record RedeemRequest(@NotBlank String code) {
  }
}
