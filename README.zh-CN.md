# F2 Quick Rename

[English](./README.md)

Obsidian 快速重命名插件：当前笔记、光标处嵌入/链接，以及 frontmatter 属性，都可在同一面板中完成。

![demo](image/README/1788595756944.png)

## 功能

### 重命名

- **F2** — 重命名当前文件，或光标所在的嵌入 / 链接目标
- 光标在标题上 — 调用 Obsidian 自带的「重命名标题」
- Wiki 嵌入（`![[文件|别名]]`）与 Markdown 图片（`![别名](文件.png)`）— 可重命名目标并编辑别名
- 外部 URL — 可编辑链接与显示标题
- Excalidraw — 编辑时不含 `.excalidraw` / `.excalidraw.md` 后缀，保存时自动还原
- 同文件夹、同主文件名、不同扩展名的文件可一并重命名
- 可选：重命名当前打开的笔记后，将新主文件名写入剪贴板
- 文件资源管理器右键：**F2 快速重命名**
- 可选：在面板中双击扩展名进行编辑（默认关闭）

### 属性（F2 / F5）

- **F2** — 仅显示设置中配置的属性；本次会话可继续添加，下次打开仍只显示配置项（合并写入，不覆盖其它 frontmatter）
- **F5** — 全量属性面板（添加 / 编辑 / 删除 / 排序 / 改类型）；整表替换 frontmatter
- 类型与 Obsidian 对齐：文本、列表、数字、复选框、日期、日期与时间
- 列表 chips、库内建议、多行文本、拖动排序（仅握把）
- 可选：打开面板时自动保存属性
- 可选：**默认折叠**属性区域（F5 仍默认展开）

### 标题栏工具

- **在文件夹中显示** — `app.showInFolder`（桌面端）
- **复制 wiki** — 最短 `[[wikilink]]`
- 标题图标随类型切换：文档、Canvas、Excalidraw、Bases、附件、链接

### 语言

**设置 → 基础设置 → 界面语言**：

- 系统默认（跟随 Obsidian）
- 简体中文
- English

## 命令

| 命令                 | 默认快捷键 |
| -------------------- | ---------- |
| 重命名文件或嵌入     | `F2`     |
| 重命名并编辑全部属性 | `F5`     |

可在 **设置 → 快捷键** 中修改。

## 安装

### 手动安装

1. 构建或下载 `main.js`、`manifest.json`、`styles.css`
2. 复制到 `<库>/.obsidian/plugins/f2-quick-rename/`
3. 在 **设置 → 社区插件** 中启用 **F2 Quick Rename**

### 开发

```bash
npm install
npm run dev
```

安装 [Hot Reload](https://github.com/pjeby/hot-reload) 后可自动热更新。

生产构建：

```bash
npm run build
```

## 设置概览

- **基础设置** — 界面语言
- **功能开关** — 嵌入、别名、标题、同名文件、剪贴板、属性、自动保存、编辑扩展名等
- **文档属性** — 默认折叠；配置 F2 面板中的字段、分隔符与并排容器

## 隐私

完全本地运行，无网络请求、无遥测、不上传库内容。

## 许可

[BSD Zero Clause License (0BSD)](./LICENSE) — Copyright (C) 2026 by PandaNocturne.
