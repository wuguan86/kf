# 中转后端（admin）

本目录提供“后端中转应用服务”，用于让用户端不直接与 Dify 交互（Dify baseUrl/apiKey 等均配置在后端）。

## 模块说明

- `transit-api`：单体后端服务（同时包含用户端与管理端接口）
- `transit-common`：多租户、MyBatis-Plus、JWT、统一异常/错误码、时间源等通用能力与实体模型
- `transit-user-api`：用户端功能分包（作为组件被单体服务引入，不单独启动）
- `transit-admin-api`：管理端功能分包（作为组件被单体服务引入，不单独启动）

## 启动前准备

### 0) JDK 与 Maven 要求

- JDK：`21`（必须）
- Maven：`3.9+`（建议）

可通过以下命令确认：

```bash
java -version
mvn -v
```

### 1) 启动 MySQL（推荐）

在本目录执行：

```bash
docker compose up -d
```

默认数据库：
- host：`localhost`
- port：`3306`
- db：`transit`
- user：`root`
- password：`root`

### 2) 配置环境变量（建议）

单体服务使用同一套 JWT 密钥：

- `TRANSIT_JWT_SECRET`：至少 32 字节（HS256）

单体服务额外需要：

- `DIFY_BASE_URL`：例如 `http://119.91.142.187`
- `DIFY_API_KEY`：Dify Chat App API Key
- `WECHAT_APP_ID` / `WECHAT_APP_SECRET`：微信开放平台扫码登录配置
- `WECHAT_CALLBACK_URL`：例如 `http://localhost:8081/api/user/auth/wechat/callback`

## 启动服务

在 `admin/` 下执行：

```bash
mvn -DskipTests package
```

启动单体服务（默认 8081）：

```bash
mvn -pl transit-api spring-boot:run
```

> 所有构建与运行命令需在 JDK21 环境下执行。
> Flyway 会在启动时自动建表（`db/migration/V1__init.sql`）。

## 接口概览

### 用户端（/api/user）

- 微信扫码
  - `GET /api/user/auth/wechat/qrcode?tenantId=1&redirect=...`
  - `GET /api/user/auth/wechat/callback?code=...&state=...`
- 用户信息
  - `GET /api/user/me`
- 会员
  - `GET /api/user/membership/plans`
  - `GET /api/user/membership/me`
  - `GET /api/user/points/ledger?limit=50`
- Dify 代理
  - `POST /api/user/dify/chat-messages`
  - `GET /api/user/dify/datasets/{datasetId}/documents/{documentId}`
  - `POST /api/user/dify/datasets/{datasetId}/document/create-by-file`
  - `PUT /api/user/dify/kb`（绑定用户与知识库 ID）

用户端鉴权：
- Header：`Authorization: Bearer <userToken>`
- Header：`X-Tenant-Id: <tenantId>`

### 管理端（/api/admin）

- 登录
  - `POST /api/admin/auth/login`
- 会员方案配置
  - `GET /api/admin/membership/plans`
  - `POST /api/admin/membership/plans`
  - `PUT /api/admin/membership/plans/{id}`
  - `POST /api/admin/membership/plans/{id}/enabled?enabled=true`

管理端鉴权：
- Header：`Authorization: Bearer <adminToken>`
- Header：`X-Tenant-Id: <tenantId>`
