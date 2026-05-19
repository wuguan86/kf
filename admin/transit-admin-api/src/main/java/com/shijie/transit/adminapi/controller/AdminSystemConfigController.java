package com.shijie.transit.adminapi.controller;

import com.shijie.transit.adminapi.service.SystemConfigService;
import com.shijie.transit.adminapi.dto.StatisticalConfigDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.web.Result;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/system-config")
public class AdminSystemConfigController {

    private final SystemConfigService systemConfigService;
    private final ObjectMapper objectMapper;
    private final Path uploadDir = Paths.get("uploads", "config");

    public AdminSystemConfigController(SystemConfigService systemConfigService, ObjectMapper objectMapper) {
        this.systemConfigService = systemConfigService;
        this.objectMapper = objectMapper;
        try {
            if (!Files.exists(uploadDir)) {
                Files.createDirectories(uploadDir);
            }
        } catch (IOException e) {
            throw new RuntimeException("Could not initialize storage", e);
        }
    }

    @GetMapping("/customer-service")
    public Result<Map<String, String>> getCustomerServiceConfig() {
        Map<String, String> config = new HashMap<>();
        config.put("wechat", systemConfigService.getValue("customer_service_wechat"));
        config.put("wechat_qrcode", systemConfigService.getValue("customer_service_wechat_qrcode"));
        config.put("email", systemConfigService.getValue("customer_service_email"));
        return Result.success(config);
    }

    @PostMapping("/customer-service")
    public Result<Void> updateCustomerServiceConfig(@RequestBody Map<String, String> config) {
        if (config.containsKey("wechat")) {
            systemConfigService.setValue("customer_service_wechat", config.get("wechat"), "官方微信");
        }
        if (config.containsKey("wechat_qrcode")) {
            systemConfigService.setValue("customer_service_wechat_qrcode", config.get("wechat_qrcode"), "官方微信二维码");
        }
        if (config.containsKey("email")) {
            systemConfigService.setValue("customer_service_email", config.get("email"), "售后邮箱");
        }
        return Result.success(null);
    }

    @GetMapping("/wechat-channel")
    public Result<Map<String, String>> getWechatChannel() {
        Map<String, String> config = new HashMap<>();
        String channel = systemConfigService.getValue("wechat_channel");
        config.put("channel", "enterprise".equalsIgnoreCase(channel) ? "enterprise" : "personal");
        config.put("corpId", defaultString(systemConfigService.getValue("enterprise_wechat_corp_id")));
        config.put("apiBaseUrl", defaultString(systemConfigService.getValue("enterprise_wechat_api_base_url")));
        config.put("secretConfigured", hasText(systemConfigService.getValue("enterprise_wechat_secret")) ? "true" : "false");
        config.put("tokenConfigured", hasText(systemConfigService.getValue("enterprise_wechat_token")) ? "true" : "false");
        config.put("encodingAesKeyConfigured", hasText(systemConfigService.getValue("enterprise_wechat_encoding_aes_key")) ? "true" : "false");
        return Result.success(config);
    }

    @PostMapping("/wechat-channel")
    public Result<Void> updateWechatChannel(@RequestBody Map<String, String> config) {
        if (config.containsKey("channel")) {
            String channel = "enterprise".equalsIgnoreCase(config.get("channel")) ? "enterprise" : "personal";
            systemConfigService.setValue("wechat_channel", channel, "微信消息通道");
        }
        setSecretConfig(config, "corpId", "enterprise_wechat_corp_id", "企业微信 CorpID");
        setSecretConfig(config, "secret", "enterprise_wechat_secret", "企业微信 Secret");
        setSecretConfig(config, "token", "enterprise_wechat_token", "企业微信回调 Token");
        setSecretConfig(config, "encodingAesKey", "enterprise_wechat_encoding_aes_key", "企业微信回调 EncodingAESKey");
        setSecretConfig(config, "apiBaseUrl", "enterprise_wechat_api_base_url", "企业微信 API 地址");
        return Result.success(null);
    }

    @PostMapping("/customer-service/upload-qr")
    public Result<String> uploadQrCode(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("File cannot be empty");
        }
        try {
            String originalFilename = file.getOriginalFilename();
            String extension = "";
            if (originalFilename != null && originalFilename.lastIndexOf(".") > 0) {
                extension = originalFilename.substring(originalFilename.lastIndexOf("."));
            }
            String filename = UUID.randomUUID().toString() + extension;
            Path targetLocation = uploadDir.resolve(filename);
            Files.copy(file.getInputStream(), targetLocation);
            
            // Return relative path that can be accessed via user api
            String fileUrl = "/api/user/system-config/image/" + filename;
            return Result.success(fileUrl);
        } catch (IOException e) {
            throw new RuntimeException("Failed to store file", e);
        }
    }

    @GetMapping("/statistical")
    public Result<StatisticalConfigDTO> getStatisticalConfig() {
        String json = systemConfigService.getValue("statistical_scoring_config");
        if (json == null) {
            return Result.success(createDefaultStatisticalConfig());
        }
        try {
            return Result.success(objectMapper.readValue(json, StatisticalConfigDTO.class));
        } catch (IOException e) {
            throw new RuntimeException("Failed to parse config", e);
        }
    }

    @PostMapping("/statistical")
    public Result<Void> updateStatisticalConfig(@RequestBody StatisticalConfigDTO config) {
        try {
            String json = objectMapper.writeValueAsString(config);
            systemConfigService.setValue("statistical_scoring_config", json, "统计评分配置");
            return Result.success(null);
        } catch (IOException e) {
            throw new RuntimeException("Failed to serialize config", e);
        }
    }

    private StatisticalConfigDTO createDefaultStatisticalConfig() {
        StatisticalConfigDTO dto = new StatisticalConfigDTO();
        List<StatisticalConfigDTO.Dimension> dimensions = new ArrayList<>();

        // Demand Strength
        StatisticalConfigDTO.Dimension demand = new StatisticalConfigDTO.Dimension();
        demand.setKey("demand");
        demand.setName("需求强度");
        demand.setWeight(40);
        List<StatisticalConfigDTO.Level> demandLevels = new ArrayList<>();
        demandLevels.add(createLevel("高", 40));
        demandLevels.add(createLevel("中", 20));
        demandLevels.add(createLevel("低", 0));
        demand.setLevels(demandLevels);
        dimensions.add(demand);

        // Budget
        StatisticalConfigDTO.Dimension budget = new StatisticalConfigDTO.Dimension();
        budget.setKey("budget");
        budget.setName("预算");
        budget.setWeight(30);
        List<StatisticalConfigDTO.Level> budgetLevels = new ArrayList<>();
        budgetLevels.add(createLevel("高", 30));
        budgetLevels.add(createLevel("中", 15));
        budgetLevels.add(createLevel("低", 5));
        budgetLevels.add(createLevel("未知", 10));
        budget.setLevels(budgetLevels);
        dimensions.add(budget);

        // Time
        StatisticalConfigDTO.Dimension time = new StatisticalConfigDTO.Dimension();
        time.setKey("time");
        time.setName("购买/到店时间");
        time.setWeight(30);
        List<StatisticalConfigDTO.Level> timeLevels = new ArrayList<>();
        timeLevels.add(createLevel("短期", 30));
        timeLevels.add(createLevel("中期", 15));
        timeLevels.add(createLevel("长期", 5));
        timeLevels.add(createLevel("未知", 10));
        time.setLevels(timeLevels);
        dimensions.add(time);

        dto.setDimensions(dimensions);

        StatisticalConfigDTO.Thresholds thresholds = new StatisticalConfigDTO.Thresholds();
        thresholds.setHigh(70);
        thresholds.setMedium(40);
        dto.setThresholds(thresholds);

        dto.setHighIntentKeywords(new ArrayList<>());
        dto.setLowIntentKeywords(new ArrayList<>());

        return dto;
    }

    private StatisticalConfigDTO.Level createLevel(String name, Integer score) {
        StatisticalConfigDTO.Level level = new StatisticalConfigDTO.Level();
        level.setName(name);
        level.setScore(score);
        return level;
    }

    private void setSecretConfig(Map<String, String> config, String requestKey, String configKey, String description) {
        if (!config.containsKey(requestKey)) {
            return;
        }
        String value = config.get(requestKey);
        if (value == null || value.isBlank() || "********".equals(value.trim())) {
            return;
        }
        systemConfigService.setValue(configKey, value.trim(), description);
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
