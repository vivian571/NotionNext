require('dotenv').config({ path: `${__dirname}/../../.env.local` });

const path = require('path');

const config = {
  notion: {
    token: process.env.NOTION_TOKEN,
    databaseId: process.env.DATABASE_ID,
    pageId: process.env.NOTION_PAGE_ID,
  },
  paths: {
    posts: path.join(process.cwd(), 'content/posts'),
  },
  limits: {
    textChunkSize: 2000, // Notion API 文本块大小限制
    retry: {
      maxAttempts: 3,    // 最大重试次数
      delay: 1000,       // 重试延迟(ms)
      factor: 2,         // 重试延迟倍数
    },
    concurrency: 3,      // 并发上传数量
  },
};

// 验证必要配置
const requiredVars = [
  { key: 'NOTION_TOKEN', value: config.notion.token },
  { key: 'DATABASE_ID', value: config.notion.databaseId },
];

const missingVars = requiredVars.filter(v => !v.value).map(v => v.key);
if (missingVars.length > 0) {
  console.error(`❌ 错误: 缺少必要的环境变量: ${missingVars.join(', ')}`);
  console.error(`请确保在 .env.local 文件中设置这些变量`);
  process.exit(1);
}

module.exports = config;
