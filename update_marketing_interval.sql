-- Update marketing_like_config table
ALTER TABLE marketing_like_config ADD COLUMN like_interval_start INT DEFAULT 60 COMMENT '点赞间隔开始(秒)';
ALTER TABLE marketing_like_config ADD COLUMN like_interval_end INT DEFAULT 120 COMMENT '点赞间隔结束(秒)';

-- Migrate existing data
UPDATE marketing_like_config SET like_interval_start = like_interval, like_interval_end = like_interval;

-- Drop old column
ALTER TABLE marketing_like_config DROP COLUMN like_interval;

-- Update marketing_comment_config table
ALTER TABLE marketing_comment_config ADD COLUMN comment_interval_start INT DEFAULT 120 COMMENT '评论间隔开始(秒)';
ALTER TABLE marketing_comment_config ADD COLUMN comment_interval_end INT DEFAULT 180 COMMENT '评论间隔结束(秒)';

-- Migrate existing data
UPDATE marketing_comment_config SET comment_interval_start = comment_interval, comment_interval_end = comment_interval;

-- Drop old column
ALTER TABLE marketing_comment_config DROP COLUMN comment_interval;
