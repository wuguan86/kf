package com.shijie.transit.api;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class ManualSchemaUpdater implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    public ManualSchemaUpdater(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        ensureUserAccountInitColumn();
        ensureUserIntentDailySummaryColumn();
        ensureEnterpriseWechatTables();
        ensureEnterpriseWechatMessageOpenKfidColumn();
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS system_config (
              id BIGINT NOT NULL PRIMARY KEY COMMENT '主键ID',
              tenant_id BIGINT NOT NULL COMMENT '租户ID',
              config_key VARCHAR(128) NOT NULL COMMENT '配置键',
              config_value TEXT COMMENT '配置值',
              description VARCHAR(255) COMMENT '描述',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
              UNIQUE KEY uk_system_config_key (tenant_id, config_key) COMMENT '唯一索引:租户+配置键'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置表';
        """);
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS user_intent (
              id BIGINT NOT NULL PRIMARY KEY COMMENT '主键ID',
              tenant_id BIGINT NOT NULL COMMENT '租户ID',
              owner_user_id BIGINT NOT NULL COMMENT '系统用户ID',
              contact_key VARCHAR(128) NOT NULL COMMENT '微信联系人标识',
              demand_level VARCHAR(16) NOT NULL DEFAULT 'unknown' COMMENT '需求强度等级',
              budget_level VARCHAR(16) NOT NULL DEFAULT 'unknown' COMMENT '预算情况等级',
              time_level VARCHAR(16) NOT NULL DEFAULT 'unknown' COMMENT '购买时间等级',
              latest_event VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT '最近事件',
              total_score INT NOT NULL DEFAULT 0 COMMENT '总分(0-100)',
              intent_level TINYINT NOT NULL DEFAULT 1 COMMENT '意向等级 1低 2中 3高',
              ai_reason TEXT COMMENT '判定理由',
              analysis_source VARCHAR(16) NOT NULL DEFAULT 'WORKFLOW' COMMENT '分析来源',
              last_analyzed_msg_id BIGINT NOT NULL DEFAULT 0 COMMENT '最后分析消息ID',
              last_analyzed_at DATETIME(3) COMMENT '最后分析时间',
              created_at DATETIME(3) NOT NULL COMMENT '创建时间',
              updated_at DATETIME(3) NOT NULL COMMENT '更新时间',
              UNIQUE KEY uk_intent_owner_contact (tenant_id, owner_user_id, contact_key) COMMENT '唯一索引:租户+用户+联系人',
              KEY idx_intent_level (tenant_id, owner_user_id, intent_level) COMMENT '索引:租户+用户+意向等级'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户意向主表';
        """);
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS intent_analysis_log (
              id BIGINT NOT NULL PRIMARY KEY COMMENT '主键ID',
              tenant_id BIGINT NOT NULL COMMENT '租户ID',
              owner_user_id BIGINT NOT NULL COMMENT '系统用户ID',
              contact_key VARCHAR(128) NOT NULL COMMENT '微信联系人标识',
              source_msg_id BIGINT NOT NULL DEFAULT 0 COMMENT '触发分析的消息ID',
              before_intent_level TINYINT DEFAULT NULL COMMENT '分析前意向等级',
              after_intent_level TINYINT DEFAULT NULL COMMENT '分析后意向等级',
              raw_llm_json TEXT COMMENT 'LLM原始输出',
              decision_reason TEXT COMMENT '判定原因',
              created_at DATETIME(3) NOT NULL COMMENT '创建时间',
              updated_at DATETIME(3) NOT NULL COMMENT '更新时间',
              KEY idx_log_owner_time (tenant_id, owner_user_id, created_at) COMMENT '索引:租户+用户+时间',
              KEY idx_log_contact_time (tenant_id, owner_user_id, contact_key, created_at) COMMENT '索引:租户+用户+联系人+时间'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='意向分析日志表';
        """);
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS intent_daily_stats (
              id BIGINT NOT NULL PRIMARY KEY COMMENT '主键ID',
              tenant_id BIGINT NOT NULL COMMENT '租户ID',
              owner_user_id BIGINT NOT NULL COMMENT '系统用户ID',
              stats_date DATE NOT NULL COMMENT '统计日期',
              high_intent_count INT NOT NULL DEFAULT 0 COMMENT '高意向数',
              mid_intent_count INT NOT NULL DEFAULT 0 COMMENT '中意向数',
              low_intent_count INT NOT NULL DEFAULT 0 COMMENT '低意向数',
              new_high_intent_count INT NOT NULL DEFAULT 0 COMMENT '当日新增高意向数',
              new_user_count INT NOT NULL DEFAULT 0 COMMENT '当日新增客户数',
              created_at DATETIME(3) NOT NULL COMMENT '创建时间',
              updated_at DATETIME(3) NOT NULL COMMENT '更新时间',
              UNIQUE KEY uk_daily_owner_date (tenant_id, owner_user_id, stats_date) COMMENT '唯一索引:租户+用户+日期'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='意向每日统计表';
        """);
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS user_intent_daily_snapshot (
              id BIGINT NOT NULL PRIMARY KEY COMMENT '主键ID',
              tenant_id BIGINT NOT NULL COMMENT '租户ID',
              owner_user_id BIGINT NOT NULL COMMENT '系统用户ID',
              contact_key VARCHAR(128) NOT NULL COMMENT '微信联系人标识',
              stats_date DATE NOT NULL COMMENT '统计日期',
              intent_level TINYINT NOT NULL COMMENT '意向等级 1低 2中 3高',
              daily_summary TEXT COMMENT '当日对话总结',
              last_chat_time DATETIME(3) COMMENT '当日最后聊天时间',
              created_at DATETIME(3) NOT NULL COMMENT '创建时间',
              updated_at DATETIME(3) NOT NULL COMMENT '更新时间',
              UNIQUE KEY uk_snapshot_owner_contact_date (tenant_id, owner_user_id, contact_key, stats_date) COMMENT '唯一索引:租户+用户+联系人+日期',
              KEY idx_snapshot_query (tenant_id, owner_user_id, stats_date, intent_level, last_chat_time) COMMENT '索引:筛选与排序'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户意向每日快照表';
        """);
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS manual_kb_sync_record (
              id BIGINT NOT NULL PRIMARY KEY COMMENT '主键ID',
              tenant_id BIGINT NOT NULL COMMENT '租户ID',
              user_id BIGINT NOT NULL COMMENT '用户ID',
              kb_id BIGINT NOT NULL COMMENT '知识库ID',
              dify_dataset_id VARCHAR(128) NOT NULL COMMENT 'Dify知识库ID',
              contact_key VARCHAR(256) NOT NULL COMMENT '联系人标识',
              customer_message TEXT NOT NULL COMMENT '客户消息',
              ai_reply_message TEXT NOT NULL COMMENT 'AI回复消息',
              document_year INT NOT NULL COMMENT '文档年度',
              document_name VARCHAR(255) NOT NULL COMMENT '文档名称',
              dify_document_id VARCHAR(128) NOT NULL DEFAULT '' COMMENT 'Dify文档ID',
              sync_status VARCHAR(32) NOT NULL DEFAULT 'PENDING' COMMENT '同步状态',
              sync_result TEXT NOT NULL COMMENT '同步结果',
              sync_failed_reason TEXT NOT NULL COMMENT '失败原因',
              synced_at DATETIME(3) COMMENT '同步时间',
              created_at DATETIME(3) NOT NULL COMMENT '创建时间',
              updated_at DATETIME(3) NOT NULL COMMENT '更新时间',
              KEY idx_manual_sync_user_kb_time (tenant_id, user_id, kb_id, created_at) COMMENT '索引:租户+用户+知识库+时间',
              KEY idx_manual_sync_user_status_time (tenant_id, user_id, sync_status, created_at) COMMENT '索引:租户+用户+状态+时间'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人工采集知识库同步记录表';
        """);
    }

    private void ensureUserAccountInitColumn() {
        if (hasColumn("user_account", "is_initialized")) {
            return;
        }
        jdbcTemplate.execute("""
            ALTER TABLE user_account
            ADD COLUMN is_initialized TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否完成默认知识库初始化';
        """);
    }

    private void ensureUserIntentDailySummaryColumn() {
        if (hasColumn("user_intent", "daily_summary")) {
            return;
        }
        jdbcTemplate.execute("""
            ALTER TABLE user_intent
            ADD COLUMN daily_summary TEXT COMMENT '当日对话总结';
        """);
    }

    private boolean hasColumn(String tableName, String columnName) {
        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT COUNT(1)
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = ?
              AND column_name = ?
            """,
            Integer.class,
            tableName,
            columnName);
        return count != null && count > 0;
    }

    private void ensureEnterpriseWechatTables() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS enterprise_wechat_user_binding (
              id BIGINT NOT NULL PRIMARY KEY COMMENT '主键ID',
              tenant_id BIGINT NOT NULL COMMENT '租户ID',
              enterprise_user_id VARCHAR(128) NOT NULL COMMENT '企业微信客服或成员userid',
              enterprise_user_name VARCHAR(128) NOT NULL DEFAULT '' COMMENT '企业微信客服或成员名称',
              user_id BIGINT NOT NULL COMMENT '系统用户ID',
              remark VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注',
              status VARCHAR(32) NOT NULL DEFAULT 'ENABLED' COMMENT '状态:ENABLED启用,DISABLED停用',
              created_at DATETIME(3) NOT NULL COMMENT '创建时间',
              updated_at DATETIME(3) NOT NULL COMMENT '更新时间',
              UNIQUE KEY uk_enterprise_wechat_binding_userid (tenant_id, enterprise_user_id) COMMENT '唯一索引:租户+企微userid',
              KEY idx_enterprise_wechat_binding_user (tenant_id, user_id) COMMENT '索引:租户+系统用户'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业微信客服用户映射表';
        """);
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS enterprise_wechat_message (
              id BIGINT NOT NULL PRIMARY KEY COMMENT '主键ID',
              tenant_id BIGINT NOT NULL COMMENT '租户ID',
              message_id VARCHAR(128) NOT NULL COMMENT '内部消息ID',
              enterprise_user_id VARCHAR(128) NOT NULL DEFAULT '' COMMENT '企业微信客服或成员userid',
              open_kfid VARCHAR(128) NOT NULL DEFAULT '' COMMENT '微信客服账号ID',
              owner_user_id BIGINT COMMENT '映射后的系统用户ID',
              customer_id VARCHAR(128) NOT NULL DEFAULT '' COMMENT '企业微信外部联系人ID',
              customer_name VARCHAR(128) NOT NULL DEFAULT '' COMMENT '客户展示名称',
              content TEXT NOT NULL COMMENT '消息内容',
              message_type VARCHAR(32) NOT NULL DEFAULT 'text' COMMENT '消息类型',
              direction VARCHAR(16) NOT NULL DEFAULT 'IN' COMMENT '消息方向:IN客户消息,OUT系统回复',
              status VARCHAR(32) NOT NULL DEFAULT 'PENDING' COMMENT '状态:PENDING待处理,REPLIED已回复,FAILED失败,UNMAPPED未映射',
              raw_payload TEXT COMMENT '企业微信回调原始明文',
              fail_reason TEXT COMMENT '失败原因',
              received_at DATETIME(3) NOT NULL COMMENT '接收时间',
              replied_at DATETIME(3) COMMENT '回复时间',
              created_at DATETIME(3) NOT NULL COMMENT '创建时间',
              updated_at DATETIME(3) NOT NULL COMMENT '更新时间',
              UNIQUE KEY uk_enterprise_wechat_message_id (tenant_id, message_id) COMMENT '唯一索引:租户+消息ID',
              KEY idx_enterprise_wechat_pending (tenant_id, owner_user_id, status, received_at) COMMENT '索引:用户待处理消息'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业微信消息队列表';
        """);
    }

    private void ensureEnterpriseWechatMessageOpenKfidColumn() {
        if (hasColumn("enterprise_wechat_message", "open_kfid")) {
            return;
        }
        jdbcTemplate.execute("""
            ALTER TABLE enterprise_wechat_message
            ADD COLUMN open_kfid VARCHAR(128) NOT NULL DEFAULT '' COMMENT '微信客服账号ID'
            AFTER enterprise_user_id;
        """);
    }
}
