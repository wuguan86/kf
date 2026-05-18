package com.shijie.transit.userapi.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.dify.DifyClient;
import com.shijie.transit.userapi.dify.DifyProperties;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * AI提示词优化接口
 */
@RestController
@RequestMapping("/api/user/dify")
public class UserPromptOptimizeController {

    private static final Logger log = LoggerFactory.getLogger(UserPromptOptimizeController.class);

    private final DifyClient difyClient;
    private final DifyProperties difyProperties;
    private final ObjectMapper objectMapper;

    public UserPromptOptimizeController(DifyClient difyClient, DifyProperties difyProperties, ObjectMapper objectMapper) {
        this.difyClient = difyClient;
        this.difyProperties = difyProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * 优化提示词
     *
     * @param requestJson 请求JSON体，包含originalPrompt
     * @return 优化后的提示词
     */
    @PostMapping(value = "/prompt-optimize", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Result<Map<String, String>> optimizePrompt(@RequestBody String requestJson) {
        try {
            JsonNode root = objectMapper.readTree(requestJson);
            String originalPrompt = root.path("originalPrompt").asText("");

            if (!StringUtils.hasText(originalPrompt)) {
                throw new TransitException(ErrorCode.BAD_REQUEST, "原提示词不能为空");
            }

            String apiKey = difyProperties.getPromptOptimizeWorkflowApiKey();
            if (!StringUtils.hasText(apiKey)) {
                log.warn("提示词优化工作流API Key未配置");
                throw new TransitException(ErrorCode.INTERNAL_ERROR, "提示词优化服务未配置");
            }

            // 构建Dify工作流参数
            ObjectNode inputs = objectMapper.createObjectNode();
            inputs.put("original_prompt", originalPrompt);

            log.info("调用Dify提示词优化工作流，参数长度: {}", originalPrompt.length());
            String difyResultJson = difyClient.runWorkflow(apiKey, inputs, "prompt-optimize");

            // DifyClient.runWorkflow 内部已经解析了返回结果，直接返回了 text 或 result 字段的值
            // 如果内部返回 null 或者抛出异常，说明失败了
            if (!StringUtils.hasText(difyResultJson)) {
                log.error("Dify返回的优化结果为空");
                throw new TransitException(ErrorCode.INTERNAL_ERROR, "未能生成优化后的提示词");
            }

            log.info("提示词优化成功，结果长度: {}", difyResultJson.length());
            
            Map<String, String> resultMap = new HashMap<>();
            resultMap.put("text", difyResultJson);
            return Result.success(resultMap);

        } catch (TransitException e) {
            throw e;
        } catch (Exception e) {
            log.error("调用Dify提示词优化工作流异常", e);
            throw new TransitException(ErrorCode.INTERNAL_ERROR, "提示词优化失败");
        }
    }
}
