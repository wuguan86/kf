-- Add enabled column to marketing_like_config
ALTER TABLE marketing_like_config ADD COLUMN enabled TINYINT(1) DEFAULT 0 COMMENT '是否启用';

-- Add enabled column to marketing_comment_config
ALTER TABLE marketing_comment_config ADD COLUMN enabled TINYINT(1) DEFAULT 0 COMMENT '是否启用';
