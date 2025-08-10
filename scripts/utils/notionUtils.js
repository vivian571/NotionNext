const { Client } = require('@notionhq/client');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const { markdownToNotionBlocks } = require('./markdownToNotion');

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
          property: 'slug',
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
    // 获取数据库模式
    const database = await withRetry(() => 
      notion.databases.retrieve({ database_id: config.notion.databaseId })
    );
    
    // 检查页面是否已存在
    const existingPageId = await findPageBySlug(config.notion.databaseId, slug);
    
    // 准备页面属性
    const pageProperties = {};
    
    // 查找标题属性
    const titleProp = Object.entries(database.properties).find(
      ([_, prop]) => prop.type === 'title'
    );
    
    if (titleProp) {
      const [titlePropName] = titleProp;
      pageProperties[titlePropName] = {
        title: [{ text: { content: title } }]
      };
    }
    
    // 查找标签属性（多选）
    const tagsProp = Object.entries(database.properties).find(
      ([_, prop]) => prop.type === 'multi_select' && ['标签', 'tags', '分类', 'categories'].includes(prop.name.toLowerCase())
    );
    
    if (tagsProp && properties.tags && properties.tags.length > 0) {
      const [tagsPropName] = tagsProp;
      pageProperties[tagsPropName] = {
        multi_select: Array.isArray(properties.tags) 
          ? properties.tags.map(tag => ({ name: String(tag) }))
          : [{ name: String(properties.tags) }]
      };
    }
    
    // 查找状态属性（选择）
    const statusProp = Object.entries(database.properties).find(
      ([_, prop]) => prop.type === 'select' && ['状态', 'status', 'state'].includes(prop.name.toLowerCase())
    );
    
    if (statusProp) {
      const [statusPropName] = statusProp;
      pageProperties[statusPropName] = properties.status ? {
        select: { name: String(properties.status) }
      } : { select: { name: 'published' } };
    }
    
    // 输出所有可用属性以便调试
    console.log('可用的数据库属性:', Object.entries(database.properties).map(([key, prop]) => `${key} (${prop.type})`).join(', '));
    
    // 查找类型属性（选择）
    let typePropName = null;
    let typePropObj = null;
    
    // 先尝试精确匹配
    for (const [name, prop] of Object.entries(database.properties)) {
      if (prop.type === 'select' && ['类型', 'type', 'category', '类别', '分类'].includes(prop.name.toLowerCase())) {
        typePropName = name;
        typePropObj = prop;
        break;
      }
    }
    
    if (typePropName && typePropObj) {
      // 输出详细的类型属性信息
      console.log('=== 类型属性调试信息 ===');
      console.log('类型属性名称:', typePropName);
      console.log('类型属性对象:', JSON.stringify(typePropObj, null, 2));
      console.log('可用的类型选项:', typePropObj.select?.options?.map(o => o.name).join(', ') || '无选项');
      
      // 获取类型值，默认从 properties.type 或 'Post' 获取
      let typeValue = properties.type || 'Post';
      console.log('原始 type 值:', properties.type);
      console.log('使用的 type 值:', typeValue);
      
      // 确保 typeValue 是字符串
      typeValue = String(typeValue);
      console.log('转换后的 type 值:', typeValue);
      
      // 检查选项是否存在
      const options = typePropObj.select?.options || [];
      console.log('所有选项:', options.map(o => o.name));
      
      const optionExists = options.some(opt => 
        String(opt.name).toLowerCase() === typeValue.toLowerCase()
      );
      
      console.log('选项存在性检查:', optionExists);
      
      if (optionExists) {
        // 找到匹配的选项，使用原始的大小写格式
        const matchedOption = options.find(opt => 
          String(opt.name).toLowerCase() === typeValue.toLowerCase()
        );
        
        console.log('匹配的选项:', matchedOption);
        
        // 使用匹配的选项
        console.log(`✅ 使用类型: ${matchedOption.name}`);
        pageProperties[typePropName] = {
          select: {
            id: matchedOption.id,
            name: matchedOption.name
          }
        };
        
        // 输出最终的 pageProperties 用于调试
        console.log('最终的 pageProperties:', JSON.stringify({
          ...pageProperties,
          // 隐藏可能过长的内容
          content: pageProperties.content ? '[内容已隐藏]' : undefined
        }, null, 2));
      } else {
        // 如果选项不存在，使用第一个可用选项
        const defaultOption = typePropObj.select?.options?.[0]?.name;
        if (defaultOption) {
          pageProperties[typePropName] = {
            select: { name: defaultOption }
          };
          console.warn(`类型值 '${typeValue}' 不在选项列表中，使用默认值: ${defaultOption}`);
        } else {
          console.warn(`类型值 '${typeValue}' 不在选项列表中，且无默认值可用`);
          delete pageProperties[typePropName]; // 移除无效的类型属性
        }
      }
    } else {
      console.warn('未找到类型属性，跳过设置');
    }
    
    // 查找日期属性
    const dateProp = Object.entries(database.properties).find(
      ([_, prop]) => prop.type === 'date' && ['日期', 'date', 'created', 'updated'].includes(prop.name.toLowerCase())
    );
    
    if (dateProp) {
      const [datePropName] = dateProp;
      pageProperties[datePropName] = {
        date: { start: new Date(date || new Date()).toISOString() }
      };
    }
    
    // 添加 slug 作为隐藏属性，用于查询
    const slugProp = Object.entries(database.properties).find(
      ([_, prop]) => prop.type === 'rich_text' && ['slug', '标识符', 'url'].includes(prop.name.toLowerCase())
    );
    
    if (slugProp) {
      const [slugPropName] = slugProp;
      pageProperties[slugPropName] = {
        rich_text: [{ text: { content: String(slug) } }]
      };
    }

    // 添加其他自定义属性
    Object.entries(properties).forEach(([key, value]) => {
      if (value === undefined) return;
      
      // 跳过已经处理的属性
      if (['title', 'slug', 'date', 'tags', 'status'].includes(key.toLowerCase())) {
        return;
      }
      
      // 根据值的类型设置属性
      if (Array.isArray(value)) {
        // 处理数组类型的值
        pageProperties[key] = {
          multi_select: value.map(item => ({
            name: String(item)
          }))
        };
      } else if (typeof value === 'object' && value !== null) {
        // 处理对象类型的值
        pageProperties[key] = value;
      } else {
        // 默认处理为文本
        pageProperties[key] = {
          rich_text: [{ text: { content: String(value) } }]
        };
      }
    });

    let pageId;
    
    if (existingPageId) {
      // 更新现有页面属性
      await withRetry(() => 
        notion.pages.update({
          page_id: existingPageId,
          properties: pageProperties
        })
      );
      
      // 清空现有内容
      const existingBlocks = await withRetry(() =>
        notion.blocks.children.list({
          block_id: existingPageId,
          page_size: 100 // 增加页面大小以确保获取所有块
        })
      );

      // 删除现有块
      for (const block of existingBlocks.results) {
        try {
          await withRetry(() => notion.blocks.delete({ block_id: block.id }));
        } catch (error) {
          console.warn(`删除块 ${block.id} 失败:`, error.message);
        }
      }

      // 添加新内容（直接使用传入的 content 数组）
      if (content && content.length > 0) {
        console.log('添加新内容，块数量:', content.length);
        
        // 分批添加内容，避免请求过大
        const chunkSize = 50; // Notion API 每批最多100个块
        for (let i = 0; i < content.length; i += chunkSize) {
          const chunk = content.slice(i, i + chunkSize);
          console.log(`添加块 ${i + 1}-${Math.min(i + chunkSize, content.length)}/${content.length}`);
          
          await withRetry(() =>
            notion.blocks.children.append({
              block_id: existingPageId,
              children: chunk
            })
          );
        }
      }

      pageId = existingPageId;
    } else {
      // 创建新页面
      console.log('创建新页面，块数量:', content?.length || 0);
      const pageData = {
        parent: { database_id: config.notion.databaseId },
        properties: pageProperties,
        children: content || []
      };

      console.log('准备创建/更新页面...');
      console.log('完整的请求体:', JSON.stringify({
        parent: { database_id: config.notion.databaseId },
        properties: pageProperties,
        children: '[内容已隐藏]' // 不记录子块内容，避免日志过长
      }, null, 2));
      
      const newPage = await withRetry(() =>
        notion.pages.create(pageData)
      );
      pageId = newPage.id;
    } 
    console.log(`✅ 已${existingPageId ? '更新' : '创建'}页面: ${title} (${slug})`);
    
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
