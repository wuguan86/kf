# 单点登录互踢 SQL 说明

## 执行顺序
1. 在目标库执行 `20260326_user_online_session.sql`。
2. 确认表结构、索引和注释创建成功。
3. 发布后端版本，启用会话校验与 SSE 推送能力。

## 上线前检查
- 确认数据库时区与应用时区一致。
- 确认 `user_online_session.session_id` 唯一索引可用。
- 确认应用使用雪花算法生成主键。

## 回滚建议
- 如需回滚功能，先回退应用版本，再执行：

```sql
DROP TABLE IF EXISTS `user_online_session`;
```
