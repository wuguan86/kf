# 视界 AI 助手图标设计

## 目标

为 Windows 桌面端重设计应用图标，并修复 Windows 任务栏缩放时图标模糊的问题。

## 视觉设计

- 采用已确认的 A 方案“视界之窗”。
- 图标为白色圆角方形底，主图形使用 `#1674FF`。
- 蓝色放大镜表示“视界”和观察能力；右上角青蓝星芒表示 AI 洞察。
- 图标中不使用文字、细线或低对比元素，保证 16 至 32 像素尺寸的可辨识性。

## 资源交付

- 新增可编辑矢量源文件 `user/resources/icon.svg`。
- 替换 `user/resources/icon.png`，输出为带透明通道的 2048 x 2048 PNG。
- 替换 `user/resources/icon.ico`，包含 16、20、24、32、40、48、64、128、256 像素层，并保留透明通道。

## 集成范围

- Electron 开发环境通过 `user/src/main/index.ts` 的 `APP_ICON_PATH` 使用 `resources/icon.ico`。
- 安装包通过 `user/package.json` 的 `build.win.icon` 使用相同的 `resources/icon.ico`。
- 现有引用链正确，不改变窗口行为、应用标识或安装包名称。

## 验收标准

- ICO 中每个预期尺寸均可被图像工具识别。
- PNG 与 ICO 的 256 像素层视觉一致，四角透明。
- Electron 构建成功，打包配置仍指向新的 ICO 文件。
- 不改动与图标无关的业务代码或用户数据。
