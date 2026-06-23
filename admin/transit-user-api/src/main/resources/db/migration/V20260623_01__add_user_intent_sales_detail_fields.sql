-- 为智能销售意向分析补充可解释字段。
-- 这些字段只沉淀从聊天内容中分析出的预算描述、购买时间、痛点和竞品信息；
-- 客户阶段、电话、标签和画像继续由 CRM 档案与标签关系表提供，避免在 user_intent 中冗余造成上下文过期。
ALTER TABLE user_intent
  ADD COLUMN budget_desc varchar(128) NOT NULL DEFAULT '未知' COMMENT '预算具体描述' AFTER time_level,
  ADD COLUMN time_desc varchar(128) NOT NULL DEFAULT '未知' COMMENT '购买时间具体描述' AFTER budget_desc,
  ADD COLUMN pain_points text NULL COMMENT '客户的核心痛点' AFTER time_desc,
  ADD COLUMN competitors varchar(255) NULL COMMENT '提及的竞品名称' AFTER pain_points;
