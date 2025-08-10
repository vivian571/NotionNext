const { Client } = require('@notionhq/client');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');

const notion = new Client({ auth: config.notion.token });

/**
 * 重试包装器，用于处理API限流和重试
 * @param {Function} fn - 要执行的异步函数
 * @param {number} [maxAttempts=3] - 最大重试次数
 * @param {number} [delay=1000] - 初始延迟(ms)
 * @param {number} [factor=2] - 延迟倍数
 * @returns {Promise<any>} - 函数执行结果
 */
async function withRetry(fn, maxAttempts = 3, delay = 1000, factor = 2) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // 如果是429错误（限流）且不是最后一次重试，则等待后重试
      if (error.status === 429 && attempt < maxAttempts) {
        const waitTime = delay * Math.pow(factor, attempt - 1);
        console.warn(`API限流，等待 ${waitTime}ms 后重试 (${attempt}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // 其他错误或达到最大重试次数
      if (attempt === maxAttempts) {
        console.error(`操作失败，已达到最大重试次数 (${maxAttempts})`);
        throw lastError;
      }
    }
  }
  
  throw lastError; // 永远不会执行到这里，只是为了满足类型检查
}

/**
 * 检查页面是否已存在
 * @param {string} databaseId - 数据库ID
 * @param {string} slug - 页面唯一标识
 * @returns {Promise<string | null>} - 如果存在则返回页面ID，否则返回null
 */
async function findPageBySlug(databaseId, slug) {
  try {
    const response = await withRetry(() => 
      notion.databases.query({
        database_id: databaseId,
        filter: {
          property: 'Slug',
          rich_text: { equals: slug }
        },
        page_size: 1
      })
    );
    
    return response.results[0]?.id || null;
  } catch (error) {
    console.error('查询页面失败:', error);
    throw error;
  }
}

/**
 * 创建或更新页面
 * @param {Object} params - 页面参数
 * @returns {Promise<string>} - 页面ID
 */
async function createOrUpdatePage({ title, content, slug, date, ...properties }) {
  if (!title) throw new Error('文章标题不能为空');
  if (!slug) throw new Error('Slug 不能为空');

  try {
    // 检查页面是否已存在
    const existingPageId = await findPageBySlug(config.notion.databaseId, slug);
    
    // 准备页面属性
    const pageProperties = {
      'Name': {
        title: [{ text: { content: title } }]
      },
      'Slug': {
        rich_text: [{ text: { content: slug } }]
      },
      'Date': {
        date: { start: new Date(date || new Date()).toISOString() }
      }
    };

    // 添加其他自定义属性
    Object.entries(properties).forEach(([key, value]) => {
      if (value !== undefined) {
        pageProperties[key] = {
          rich_text: [{ text: { content: String(value) } }]
        };
      }
    });

    // 分割内容为多个块
    const contentChunks = splitTextIntoChunks(content);
    const children = contentChunks.map(chunk => ({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: chunk }
        }]
      }
    }));

    let pageId;
    
    if (existingPageId) {
      // 更新现有页面
      await withRetry(() => 
        notion.blocks.children.append({
          block_id: existingPageId,
          children: children
        })
      );
      
      await withRetry(() =>
        notion.pages.update({
          page_id: existingPageId,
          properties: pageProperties
        })
      );
      
      pageId = existingPageId;
      console.log(`✅ 已更新页面: ${title} (${slug})`);
    } else {
      // 创建新页面
      const response = await withRetry(() =>
        notion.pages.create({
          parent: { database_id: config.notion.databaseId },
          properties: pageProperties,
          children: children
        })
      );
      
      pageId = response.id;
      console.log(`✅ 已创建新页面: ${title} (${slug})`);
    }
    
    return pageId;
  } catch (error) {
    console.error(`处理页面失败 (${slug}):`, error);
    throw error;
  }
}

/**
 * 将长文本分割成多个块
 * @param {string} text - 要分割的文本
 * @param {number} maxLength - 每个块的最大长度
 * @returns {string[]} - 文本块数组
 */
function splitTextIntoChunks(text, maxLength = 2000) {
  if (!text) return [];
  
  const chunks = [];
  let currentChunk = '';
  const paragraphs = text.split('\n\n');
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 <= maxLength) {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      
      if (paragraph.length > maxLength) {
        // 如果单个段落就超过限制，则按字符分割
        for (let i = 0; i < paragraph.length; i += maxLength) {
          chunks.push(paragraph.substring(i, i + maxLength));
        }
      } else {
        currentChunk = paragraph;
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

module.exports = {
  withRetry,
  findPageBySlug,
  createOrUpdatePage,
  splitTextIntoChunks,
  notionClient: notion
};
