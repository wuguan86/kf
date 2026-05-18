package com.shijie.transit.userapi.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.SystemConfigEntity;
import com.shijie.transit.common.mapper.SystemConfigMapper;
import com.shijie.transit.common.web.Result;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/user/system-config")
public class UserSystemConfigController {

    private final SystemConfigMapper systemConfigMapper;

    public UserSystemConfigController(SystemConfigMapper systemConfigMapper) {
        this.systemConfigMapper = systemConfigMapper;
    }

    @GetMapping("/customer-service")
    public Result<Map<String, String>> getCustomerServiceConfig() {
        Map<String, String> config = new HashMap<>();
        
        SystemConfigEntity wechat = systemConfigMapper.selectOne(
                new LambdaQueryWrapper<SystemConfigEntity>().eq(SystemConfigEntity::getConfigKey, "customer_service_wechat")
        );
        config.put("wechat", wechat != null ? wechat.getConfigValue() : "");

        SystemConfigEntity wechatQrcode = systemConfigMapper.selectOne(
                new LambdaQueryWrapper<SystemConfigEntity>().eq(SystemConfigEntity::getConfigKey, "customer_service_wechat_qrcode")
        );
        config.put("wechat_qrcode", wechatQrcode != null ? wechatQrcode.getConfigValue() : "");

        SystemConfigEntity email = systemConfigMapper.selectOne(
                new LambdaQueryWrapper<SystemConfigEntity>().eq(SystemConfigEntity::getConfigKey, "customer_service_email")
        );
        config.put("email", email != null ? email.getConfigValue() : "");

        return Result.success(config);
    }

    @GetMapping("/image/{filename:.+}")
    public ResponseEntity<Resource> getImage(@PathVariable("filename") String filename) {
        try {
            Path file = Paths.get("uploads", "config").resolve(filename);
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
}
