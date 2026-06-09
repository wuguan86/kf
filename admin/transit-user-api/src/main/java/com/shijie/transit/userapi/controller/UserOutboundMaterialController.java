package com.shijie.transit.userapi.controller;

import com.shijie.transit.common.db.entity.OutboundMaterialEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.service.OutboundMaterialService;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/user/outbound-materials")
public class UserOutboundMaterialController {
  private final OutboundMaterialService outboundMaterialService;

  public UserOutboundMaterialController(OutboundMaterialService outboundMaterialService) {
    this.outboundMaterialService = outboundMaterialService;
  }

  @GetMapping
  public Result<List<OutboundMaterialEntity>> list() {
    return Result.success(outboundMaterialService.listVisibleMaterials(currentUserId()));
  }

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Result<OutboundMaterialEntity> upload(
      @RequestPart(name = "scope", required = false) String scope,
      @RequestPart(name = "name", required = false) String name,
      @RequestPart(name = "description", required = false) String description,
      @RequestPart(name = "tags", required = false) String tags,
      @RequestPart(name = "allowedChannels", required = false) String allowedChannels,
      @RequestPart(name = "autoSendEnabled", required = false) String autoSendEnabled,
      @RequestPart("file") MultipartFile file) throws IOException {
    return Result.success(outboundMaterialService.uploadMaterial(
        currentUserId(),
        scope,
        name,
        description,
        tags,
        allowedChannels,
        Boolean.parseBoolean(autoSendEnabled),
        file));
  }

  @PutMapping("/{id}")
  public Result<OutboundMaterialEntity> update(@PathVariable("id") Long id, @RequestBody OutboundMaterialEntity request) {
    return Result.success(outboundMaterialService.updateMaterial(currentUserId(), id, request));
  }

  @DeleteMapping("/{id}")
  public Result<Void> delete(@PathVariable("id") Long id) {
    outboundMaterialService.deleteMaterial(currentUserId(), id);
    return Result.success(null);
  }

  @GetMapping("/{id}/download")
  public ResponseEntity<Resource> download(@PathVariable("id") Long id) throws IOException {
    Path path = outboundMaterialService.resolveMaterialPath(currentUserId(), id);
    Resource resource = new UrlResource(path.toUri());
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .body(resource);
  }

  private Long currentUserId() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    return principal.subjectId();
  }
}
