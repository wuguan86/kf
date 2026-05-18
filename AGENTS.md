# AGENTS.md

本文件是本仓库的开发协作规范。任何自动化代理、AI 助手或开发者在修改本项目代码前，都必须先阅读并遵守本文件。

## 1. 全栈开发规范

你是一个资深的全栈工程师，精通前后端开发。在修改或生成代码时，请严格遵守以下规则：

### 1.1 通用原则

- 保持代码简洁，遵守 KISS 原则，避免过度设计。
- 保持模块化，优先拆分职责清晰的小模块。
- 所有变量名、函数名、类名、组件名必须具有描述性，并使用英文，禁止使用拼音。
- 在修改代码前，必须先分析现有逻辑，确认新代码不会破坏原有功能。
- 注释必须使用中文，并且要解释清楚业务意图、边界条件和关键实现原因。
- 必须保留必要日志，日志内容必须使用中文。
- 与用户沟通、总结、说明和输出内容必须使用中文。
- 单一职责：单个文件原则上不超过 500 行，超过时必须拆分为子组件、子模块或工具类。

## 2. 仓库结构

- `admin/`：Java 21 + Spring Boot 3 + Maven 后端多模块项目。
- `admin/transit-api/`：单体后端服务入口，聚合用户端与管理端接口。
- `admin/transit-common/`：通用能力，包括多租户、MyBatis-Plus、JWT、统一异常、统一返回、时间源等。
- `admin/transit-user-api/`：用户端业务模块，作为组件被单体服务引用。
- `admin/transit-admin-api/`：管理端业务模块，作为组件被单体服务引用。
- `admin_web/`：管理后台前端，Vite + React + TypeScript。
- `user/`：用户端桌面应用，Electron + React + TypeScript。
- `sidecar_wechat/`：微信侧车服务，主要为 Python 相关脚本和打包配置。
- `uploads/`：运行期上传或静态资源目录，修改前必须确认是否为用户数据。

## 3. 后端开发约定

- 后端技术栈为 Java 21、Spring Boot、MyBatis-Plus、Maven。
- 后端不负责生产环境跨域处理；生产环境跨域由 Nginx 或前端部署层处理。
- 统一异常处理使用 `GlobalExceptionHandler`。
- 业务异常优先使用 `TransitException`。
- 错误码优先使用统一 `ErrorCode`。
- 接口返回格式必须使用统一 `Result<T>`，包含 `code`、`msg`、`data`。
- 统一时间来源必须来自 Java 端，不能依赖数据库当前时间。
- 数据表主键 ID 使用雪花算法。
- 雪花 ID 是 19 位数字，前端会出现精度丢失风险；后端返回 JSON 时必须将 `Long` 转成 `String`，不要让前端直接处理 `Long`。
- 新增或修改数据库表、字段、迁移脚本时，必须补充清晰的中文说明或注释。
- 新增接口时必须检查鉴权、租户隔离、参数校验、异常返回和日志记录。

## 4. 前端开发约定

- `admin_web/` 使用 Vite、React、TypeScript、Tailwind CSS。
- `user/` 使用 Electron、React、TypeScript、electron-vite。
- 前端代码必须优先使用已有组件、请求封装、状态管理方式和样式约定。
- 处理后端 ID 时按字符串处理，不要转成 `number`。
- 用户可见文案必须使用中文。
- 错误提示、空状态、加载状态和关键操作反馈必须完整。
- 涉及接口调用时必须处理失败场景，并输出必要的中文日志或提示。
- React 组件应保持单一职责；组件文件接近 500 行时必须拆分组件、hooks 或工具函数。

## 5. Python 侧车开发约定

- `sidecar_wechat/` 中的脚本修改前必须确认与 Electron 打包流程的关系。
- 日志必须使用中文，并包含足够定位问题的信息。
- 配置文件变更必须同步检查 `config.yaml`、`config_dev.yaml`、`config_prod.yaml` 的一致性。
- 打包相关修改必须检查 `sidecar_wechat/package.ps1` 和 `user/package.json` 中 `extraResources` 的路径是否匹配。

## 6. 修改流程

- 修改前先阅读相关模块现有实现，遵循原有目录结构、命名方式和错误处理方式。
- 不要重构无关代码，不要顺手改动与任务无关的文件。
- 不要删除或覆盖用户已有修改。
- 涉及公共能力、鉴权、租户、支付、会员、积分、Dify 代理、微信登录等敏感逻辑时，必须扩大验证范围。
- 新增功能应优先补充或更新必要测试；如果项目没有对应测试体系，也要至少执行可用的构建、lint 或启动验证。

## 7. 常用验证命令

后端验证：

```powershell
cd admin
mvn -DskipTests package
```

后端启动：

```powershell
cd admin
mvn -pl transit-api spring-boot:run
```

管理后台前端验证：

```powershell
cd admin_web
npm run lint
npm run build
```

用户端桌面应用验证：

```powershell
cd user
npm run build
```

完整打包：

```powershell
.\build_all.ps1 -env dev
```

## 8. 输出与交付要求

- 所有交付说明必须使用中文。
- 说明中必须明确列出修改的文件、验证命令和验证结果。
- 如果某些验证无法执行，必须说明原因和剩余风险。
- 对可能影响生产数据、用户隐私或外部服务调用的改动，必须明确提醒风险。
