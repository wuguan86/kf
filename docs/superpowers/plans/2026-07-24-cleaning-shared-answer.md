# AI 清洗共享答案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 清洗后的知识库支持多个问题共享一个答案，并将每个问题独立写入 Dify 以保障检索命中。

**Architecture:** 后端清洗结果由单个 `question` 改为 `questions` 数组，解析时兼容已有单问题任务记录。桌面端将同一答案下的问题作为可增删编辑的列表展示；最终入库时由后端展开为多条独立 Q/A 文本。

**Tech Stack:** Java 21、Spring Boot、Jackson、JUnit 5、React、TypeScript、Electron Vite。

---

### Task 1: 后端回归测试

**Files:**
- Modify: `admin/transit-user-api/src/test/java/com/shijie/transit/userapi/service/KnowledgeBaseCleaningSupportTest.java`
- Modify: `admin/transit-user-api/src/test/java/com/shijie/transit/userapi/service/KnowledgeBaseCleaningServiceTest.java`

- [ ] **Step 1: 编写失败测试**

测试 AI 输出中的 `questions` 数组被保留，历史 `question` 字段能读取为单元素数组，并断言两个问题共享一个答案时，Dify 文本包含两段独立 Q/A。

- [ ] **Step 2: 运行失败测试**

Run: `mvn -pl transit-user-api -Dtest=KnowledgeBaseCleaningSupportTest,KnowledgeBaseCleaningServiceTest test`

Expected: FAIL，原因是当前模型只有单个 `question` 字段。

### Task 2: 后端清洗与 Dify 写入

**Files:**
- Modify: `admin/transit-user-api/src/main/java/com/shijie/transit/userapi/service/KnowledgeBaseQaExtractionService.java`
- Modify: `admin/transit-user-api/src/main/java/com/shijie/transit/userapi/service/KnowledgeBaseCleaningService.java`
- Modify: `admin/transit-user-api/src/main/java/com/shijie/transit/userapi/service/KnowledgeBaseQaMarkdownBuilder.java`

- [ ] **Step 1: 实现分组问答模型**

将清洗项改为 `questions`、`answer`、`status`、`warning`，仅在原文明确多个问题共用答案时分组，不生成原文不存在的同义问法。

- [ ] **Step 2: 兼容历史任务记录**

读取历史 `qaItemsJson` 时，将旧的 `question` 字段转换为单元素 `questions` 数组。

- [ ] **Step 3: 展开为 Dify 检索文本**

对每个问题分别输出 `Q：问题\nA：答案`，相邻问答间用原有分隔符隔开。

- [ ] **Step 4: 运行后端测试**

Run: `mvn -pl transit-user-api -Dtest=KnowledgeBaseCleaningSupportTest,KnowledgeBaseCleaningServiceTest test`

Expected: PASS。

### Task 3: 桌面端审核与预览

**Files:**
- Modify: `user/src/renderer/src/components/knowledge/useKnowledgeCleaningTask.ts`
- Modify: `user/src/renderer/src/components/knowledge/KnowledgeCleaningReviewTable.tsx`
- Modify: `user/src/renderer/src/components/knowledge/CleaningContentPreviewModal.tsx`
- Modify: `user/src/renderer/src/pages/KnowledgeBasePage.module.css`

- [ ] **Step 1: 调整清洗项类型**

将 `question: string` 改为 `questions: string[]`，使审核请求与服务端结构一致。

- [ ] **Step 2: 支持问题列表编辑**

在单个共享答案下显示多个问题，允许新增、修改和删除问题，但至少保留一个问题。

- [ ] **Step 3: 更新已清洗内容预览**

预览中展示同一答案关联的全部问题，避免旧的单问题字段访问造成渲染失败。

- [ ] **Step 4: 构建桌面端**

Run: `npm run build`

Expected: exit code 0。
