# 视界之窗应用图标实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成并接入清晰的“视界之窗”Windows 应用图标，修复任务栏小尺寸显示模糊问题。

**Architecture:** 以可编辑 SVG 作为设计源，使用确定性矢量几何生成 2048 像素 PNG 与多尺寸 ICO。保持现有 Electron 引用链不变，通过资源结构检查、构建和打包验证交付结果。

**Tech Stack:** SVG、Python Pillow、Electron 28、electron-vite、electron-builder

---

### Task 1: 建立资源验收基线

**Files:**
- Verify: `user/resources/icon.ico`
- Verify: `user/resources/icon.png`
- Expected create: `user/resources/icon.svg`

- [ ] **Step 1: 运行预期资源检查并确认失败**

```powershell
@'
from pathlib import Path
from PIL import Image

expected_sizes = {(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)}
assert Path('resources/icon.svg').exists(), '缺少可编辑 SVG 源文件'
icon = Image.open('resources/icon.ico')
assert set(icon.info.get('sizes', [])) == expected_sizes, 'ICO 尺寸层不完整'
png = Image.open('resources/icon.png')
assert png.size == (2048, 2048) and png.mode == 'RGBA', 'PNG 尺寸或透明通道不正确'
'@ | python -
```

Expected: FAIL，当前资源缺少 `icon.svg`，且 ICO 不含 20、24、40 像素层。

### Task 2: 制作矢量源与多尺寸资源

**Files:**
- Create: `user/resources/icon.svg`
- Modify: `user/resources/icon.png`
- Modify: `user/resources/icon.ico`

- [ ] **Step 1: 创建“视界之窗”SVG 源文件**

图形使用 1024 x 1024 画布、透明外部背景、白色圆角底、`#1674FF` 放大镜和 `#38D6F7` 星芒。所有形状使用整数坐标与宽轮廓，避免小尺寸出现半像素模糊。

- [ ] **Step 2: 从相同几何参数生成 PNG 与 ICO**

使用 Pillow 以 2048 x 2048 高分辨率绘制母版，通过 LANCZOS 缩放生成 16、20、24、32、40、48、64、128、256 像素层，并以 RGBA 格式写入 `icon.png` 与 `icon.ico`。

- [ ] **Step 3: 重新运行资源检查并确认通过**

Run: Task 1 的 Python 检查命令。

Expected: PASS，SVG 存在，PNG 为 2048 x 2048 RGBA，ICO 尺寸集合与预期完全一致。

- [ ] **Step 4: 提交资源**

```powershell
git add user/resources/icon.svg user/resources/icon.png user/resources/icon.ico
git commit -m "feat: redesign desktop app icon"
```

### Task 3: 验证 Electron 构建和安装包配置

**Files:**
- Verify: `user/package.json`
- Verify: `user/src/main/index.ts`

- [ ] **Step 1: 检查开发环境和安装包引用**

Run:

```powershell
rg -n 'resources/icon\.ico|APP_ICON_PATH|"icon": "resources/icon\.ico"' package.json src/main/index.ts
```

Expected: 主进程开发/生产路径及 electron-builder 的 Windows 图标均指向新的 `icon.ico`。

- [ ] **Step 2: 执行 Electron 构建**

Run: `npm run build`

Expected: Exit code 0，main、preload、renderer 三个构建阶段均成功。

- [ ] **Step 3: 执行 Windows 目录打包**

Run: `npm run pack`

Expected: Exit code 0，electron-builder 成功生成 Windows unpacked 应用且没有图标解析错误。

- [ ] **Step 4: 检查工作区差异**

Run: `git status --short` 与 `git diff --check HEAD~1 HEAD`

Expected: 仅包含计划、SVG、PNG、ICO 相关变更，且无空白错误。
