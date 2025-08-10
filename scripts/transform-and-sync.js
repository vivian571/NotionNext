#!/usr/bin/env node

'use strict';

const path = require('path');
const fs = require('fs').promises;
const matter = require('gray-matter');
const { createOrUpdatePage } = require('./utils/notionUtils');
const { ensureDirectoryExists, getMarkdownFiles } = require('./utils/fileUtils');
// 默认配置
const defaultConfig = {
  contentDir: path.join(process.cwd(), 'content', 'posts')
};

/**
 * 将 Markdown 转换为 Notion 块
 * @param {string} markdown - Markdown 文本
 * @param {Object} frontmatter - 文章 frontmatter
 * @returns {Array} Notion 块数组
 */
async function transformMarkdownToBlocks(markdown, frontmatter = {}) {
  const blocks = [];
  
  // 1. 添加标题
  if (frontmatter.title) {
    blocks.push({
      object: 'block',
      type: 'heading_1',
      heading_1: {
        rich_text: [{
          type: 'text',
          text: { content: frontmatter.title },
          annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' }
        }]
      }
    });
  }

  // 2. 添加作者和日期信息
  const authorInfo = [];
  if (frontmatter.author) authorInfo.push(frontmatter.author);
  if (frontmatter.date) authorInfo.push(new Date(frontmatter.date).toLocaleDateString('zh-CN'));
  
  if (authorInfo.length > 0) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: authorInfo.join(' · ') },
          annotations: { bold: false, italic: true, strikethrough: false, underline: false, code: false, color: 'default' }
        }]
      }
    });
  }

  // 3. 添加分割线
  blocks.push({
    object: 'block',
    type: 'divider',
    divider: {}
  });

  // 4. 处理内容
  const lines = markdown.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 处理标题
    if (line.startsWith('#')) {
      const level = line.match(/^#+/)[0].length;
      const content = line.replace(/^#+\s*/, '').trim();
      
      if (level <= 3) {
        blocks.push({
          object: 'block',
          type: `heading_${level}`,
          [`heading_${level}`]: {
            rich_text: [{
              type: 'text',
              text: { content: content }
            }]
          }
        });
      }
      continue;
    }

    // 处理列表
    if (line.match(/^[-*+]\s/)) {
      const content = line.substring(2).trim();
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: content }
          }]
        }
      });
      continue;
    }

    // 处理代码块
    if (line.startsWith('```')) {
      const language = line.substring(3).trim() || 'plain text';
      let codeContent = '';
      i++;
      
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeContent += lines[i] + '\n';
        i++;
      }
      
      blocks.push({
        object: 'block',
        type: 'code',
        code: {
          rich_text: [{
            type: 'text',
            text: { content: codeContent.trim() }
          }],
          language: language
        }
      });
      continue;
    }

    // 处理引用
    if (line.startsWith('> ')) {
      const content = line.substring(2).trim();
      blocks.push({
        object: 'block',
        type: 'quote',
        quote: {
          rich_text: [{
            type: 'text',
            text: { content: content }
          }]
        }
      });
      continue;
    }

    // 处理图片
    const imageMatch = line.match(/!\[(.*?)\]\((.*?)\)/);
    if (imageMatch) {
      const [, alt, url] = imageMatch;
      blocks.push({
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: { url: url },
          caption: alt ? [{ type: 'text', text: { content: alt } }] : []
        }
      });
      continue;
    }

    // 默认处理为段落
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: line }
        }]
      }
    });
  }

  return blocks;
}

/**
 * 处理单个 Markdown 文件
 * @param {string} filePath - 文件路径
 */
async function processFile(filePath) {
  try {
    console.log(`🔍 处理文件: ${filePath}`);
    
    // 读取文件内容
    const fileContent = await fs.readFile(filePath, 'utf8');
    const { content, data: frontmatter } = matter(fileContent);
    
    // 确保有标题
    if (!frontmatter.title) {
      console.warn(`⚠️ 文件 ${filePath} 缺少标题，跳过`);
      return false;
    }
    
    // 转换内容为 Notion 块
    const blocks = await transformMarkdownToBlocks(content, frontmatter);
    
    // 设置页面属性
    const pageProperties = {
      '名称': {
        title: [{ text: { content: frontmatter.title } }]
      },
      '标签': frontmatter.tags && frontmatter.tags.length > 0 ? {
        multi_select: Array.isArray(frontmatter.tags) 
          ? frontmatter.tags.map(tag => ({ name: String(tag) }))
          : [{ name: String(frontmatter.tags) }]
      } : undefined,
      '状态': frontmatter.status ? {
        select: { name: String(frontmatter.status) }
      } : { select: { name: 'published' } },
      '日期': {
        date: { start: new Date(frontmatter.date || new Date()).toISOString() }
      },
      'slug': {
        rich_text: [{ text: { content: frontmatter.slug || frontmatter.title.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-') } }]
      }
    };
    
    // 创建或更新页面
    const page = await createOrUpdatePage({
      title: frontmatter.title,
      slug: frontmatter.slug || frontmatter.title.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-'),
      date: frontmatter.date || new Date().toISOString(),
      content: blocks,
      ...frontmatter
    });
    console.log(`✅ 已同步: ${filePath}`);
    return true;
    
  } catch (error) {
    console.error(`❌ 处理文件 ${filePath} 时出错:`, error);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始转换并同步到 Notion...');
  
  try {
    // 确保内容目录存在
    await ensureDirectoryExists(defaultConfig.contentDir);
    
    // 获取所有 Markdown 文件
    const files = await getMarkdownFiles(defaultConfig.contentDir);
    console.log(`📂 找到 ${files.length} 个 Markdown 文件`);
    
    // 处理每个文件
    let successCount = 0;
    for (const file of files) {
      const success = await processFile(file);
      if (success) successCount++;
    }
    
    console.log(`\n✨ 转换并同步完成! 成功: ${successCount}/${files.length} 个文件`);
  } catch (error) {
    console.error('❌ 处理过程中出错:', error);
    process.exit(1);
  }
}

// 执行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('未捕获的异常:', error);
    process.exit(1);
  });
}

module.exports = {
  transformMarkdownToBlocks,
  processFile
};
