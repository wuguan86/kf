package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;

/**
 * 提示词模板实体类
 * <p>
 * 对应数据库表 prompt_template
 * </p>
 */
@TableName("prompt_template")
public class PromptTemplateEntity extends BaseTenantEntity {

    /** 模板名称 */
    private String name;

    /** 模板内容 (富文本) */
    private String content;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }
}
