-- 外发素材表用于保存用户上传、可发送给客户的图片或文件。
-- tenant_id 表示公司边界；scope=PRIVATE 仅上传人可见，scope=COMPANY 同租户用户可见。
CREATE TABLE IF NOT EXISTS outbound_material (
  id BIGINT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  owner_user_id BIGINT NOT NULL,
  scope VARCHAR(16) NOT NULL DEFAULT 'PRIVATE',
  name VARCHAR(255) NOT NULL,
  description TEXT,
  tags VARCHAR(512),
  file_key VARCHAR(512) NOT NULL,
  file_type VARCHAR(16) NOT NULL,
  mime_type VARCHAR(128),
  file_size BIGINT,
  extension VARCHAR(32),
  allowed_channels VARCHAR(64) NOT NULL DEFAULT 'personal,enterprise',
  auto_send_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(16) NOT NULL DEFAULT 'ENABLED',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE INDEX idx_outbound_material_tenant_scope ON outbound_material (tenant_id, scope);
CREATE INDEX idx_outbound_material_owner ON outbound_material (owner_user_id);
