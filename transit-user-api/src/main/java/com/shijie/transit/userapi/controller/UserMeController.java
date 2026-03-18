package com.shijie.transit.userapi.controller;

import com.shijie.transit.common.db.entity.UserAccountEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.service.UserAccountService;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

@RestController
@RequestMapping("/api/user")
public class UserMeController {
  private final UserAccountService userAccountService;
  private final Path avatarDir = Paths.get("uploads", "avatars");

    public UserMeController(UserAccountService userAccountService) {
    this.userAccountService = userAccountService;
    try {
        if (!Files.exists(avatarDir)) {
            Files.createDirectories(avatarDir);
        }
    } catch (IOException e) {
        throw new RuntimeException("Could not initialize storage", e);
    }
  }

  @GetMapping("/me")
  public Result<UserMeResponse> me() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    UserAccountEntity user = userAccountService.findById(principal.subjectId());
    return Result.success(new UserMeResponse(
        user.getId(), 
        user.getTenantId(), 
        user.getNickname(), 
        user.getAvatarUrl(),
        user.getPhone(),
        user.getEmail()
    ));
  }

  @PostMapping("/me/profile")
  public Result<Void> updateProfile(@RequestBody UpdateProfileRequest request) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    userAccountService.updateProfile(principal.subjectId(), request.nickname(), request.phone(), request.email());
    return Result.success(null);
  }

  @PostMapping(value = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Result<String> uploadAvatar(@RequestPart("file") MultipartFile file) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    
    if (file.isEmpty()) {
        throw new IllegalArgumentException("File cannot be empty");
    }
    try {
        String filename = UUID.randomUUID().toString() + "_" + file.getOriginalFilename();
        Path targetLocation = avatarDir.resolve(filename);
        Files.copy(file.getInputStream(), targetLocation);
        
        // Return relative URL that can be accessed via the getAvatar endpoint
        String avatarUrl = "/api/user/avatar/" + filename;
        userAccountService.updateAvatar(principal.subjectId(), avatarUrl);
        return Result.success(avatarUrl);
    } catch (IOException e) {
        throw new RuntimeException("Failed to store file", e);
    }
  }

  @GetMapping("/avatar/{filename:.+}")
  public ResponseEntity<Resource> getAvatar(@PathVariable("filename") String filename) {
    try {
        Path file = avatarDir.resolve(filename);
        Resource resource = new UrlResource(file.toUri());
        if (resource.exists() || resource.isReadable()) {
            String contentType = Files.probeContentType(file);
            if (contentType == null) {
                contentType = MediaType.IMAGE_JPEG_VALUE;
            }
            return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .body(resource);
        } else {
            return ResponseEntity.notFound().build();
        }
    } catch (Exception e) {
        return ResponseEntity.notFound().build();
    }
  }

  public record UserMeResponse(long id, long tenantId, String nickname, String avatarUrl, String phone, String email) {
  }

  public record UpdateProfileRequest(String nickname, String phone, String email) {
  }
}
