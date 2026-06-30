-- 扩展智能销售客户资料与 AI 沟通辅助画像。
-- AI 提取的姓名、电话、性别等基础资料只作为待确认草稿保存，必须人工确认后才写入正式客户字段。
ALTER TABLE crm_customer
  ADD COLUMN gender varchar(16) NOT NULL DEFAULT 'UNKNOWN' COMMENT '客户性别，人工确认后写入' AFTER phone,
  ADD COLUMN basic_info_suggestion_json text NULL COMMENT 'AI提取的基础资料待确认草稿' AFTER ai_profile_updated_at,
  ADD COLUMN basic_info_suggestion_updated_at datetime(3) NULL COMMENT '基础资料草稿更新时间' AFTER basic_info_suggestion_json;
