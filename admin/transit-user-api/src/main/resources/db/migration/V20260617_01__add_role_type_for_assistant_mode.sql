-- 为智能客服/智能销售拆分角色用途。历史角色默认归为智能客服，避免现有自动回复行为变化。
ALTER TABLE role
  ADD COLUMN role_type varchar(32) NOT NULL DEFAULT 'CUSTOMER_SERVICE' COMMENT '角色用途：CUSTOMER_SERVICE=智能客服，SALES=智能销售';
