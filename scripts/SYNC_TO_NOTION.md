# Notion 同步工具

这是一个用于将 Markdown 文件同步到 Notion 数据库的工具。它支持增量同步、错误重试和断点续传。

## 功能特点

- ✅ 增量同步：只同步有改动的文件
- 🔄 断点续传：记录同步状态，支持从断点继续
- 🔄 自动重试：处理 API 限流和网络错误
- 📝 Markdown 支持：完整支持 Markdown 语法
- 🚀 高性能：支持并发处理多个文件

## 安装依赖

确保已安装 Node.js 16+ 和 npm。然后运行：

```bash
npm install
```

## 配置

1. 在项目根目录创建 `.env.local` 文件，添加以下内容：

```env
NOTION_TOKEN=your_integration_token
DATABASE_ID=your_database_id
```

2. 确保你的 Notion 集成有权限访问指定的数据库

## 使用方法

### 同步所有文章到 Noton

```bash
npm run sync:notion
```

### 监听文件变化并自动同步

```bash
npm run sync:notion:watch
```

## 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| NOTION_TOKEN | 是 | Notion 集成 token |
| DATABASE_ID | 是 | Notion 数据库 ID |
| NOTION_PAGE_ID | 否 | 可选的父页面 ID |

## 文件格式

Markdown 文件需要包含以下 formatter：

```yaml
---
title: 文章标题
date: 2023-01-01
tags: [标签1, 标签2]
---

# 文章内容
...
```

## 同步状态

同步状态保存在 `.notion-sync-state.json` 文件中，包含每个文件的最后同步时间和状态。

## 故障排除

- **API 限流错误**：工具会自动重试，如果遇到限流，请稍后再试
- **权限问题**：确保集成有权限访问数据库
- **文件未同步**：检查文件是否在 `content/posts` 目录下，且扩展名为 `.md`

## 许可证

MIT
