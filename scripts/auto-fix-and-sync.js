//!/usr/bin/env node

'use strict';

const path = require('path');
const fs = require('fs').promises;
const chokidar = require('chokidar');
const matter = require('gray-matter');
const { createOrUpdatePage } = require('./utils/notionUtils');
const { ensureDirectoryExists, getMarkdownFiles } = require('./utils/fileUtils');

// 配置
const CONFIG = {
  contentDir: path.join(process.cwd(), 'content', 'posts'),
  watchMode: process.argv.includes('--watch'),
  debounceTime: 1000 // 防抖时间(毫秒)
};

// 默认配置
const defaultConfig = {
  contentDir: path.join(process.cwd(), 'content', 'posts')
};

// 映射到 Notion 数据库中的类型选项
const NOTION_TYPE_OPTIONS = {
  // 默认映射
  '文章': 'Post',
  '页面': 'Page',
  '公告': 'Notice',
  '菜单': 'Menu',
  '子菜单': 'SubMenu',
  '配置': 'Config',
  // 自动检测的类型映射
  'Research': 'Post',
  'Tech': 'Post',
  'Tutorial': 'Post',
  'Thoughts': 'Post',
  'News': 'Post',
  'Report': 'Post',
  'Analysis': 'Post',
  'Article': 'Post'
};

/**
 * 根据内容识别文章类型
 * @param {string} content - 文章内容
 * @returns {{type: string, tags: string[]}} 文章类型和标签
 */
function detectArticleType(content) {
  const result = {
    type: 'Post',  // 默认为 Post 类型
    tags: []
  };
  
  // 检查是否包含特定关键词来识别文章类型
  if (content.includes('## 引言') || content.includes('## 摘要') || content.includes('## 摘要') || 
      content.includes('## 背景') || content.includes('## 方法') || content.includes('## 结果') || 
      content.includes('## 讨论') || content.includes('## 结论') || content.includes('## 参考文献')) {
    result.type = 'Post';  // 学术类文章
    result.tags.push('学术', '论文');
  }
  else if (content.includes('## 问题') || content.includes('## 解决方案') || content.includes('## 代码') || 
      content.includes('```') || content.match(/def\s+\w+\s*\(|function\s+\w+\s*\(|class\s+\w+/)) {
    result.type = 'Post';  // 技术类文章
    result.tags.push('技术', '编程');
  }
  else if (content.includes('## 教程') || content.includes('## 步骤') || content.includes('## 指南') || 
      content.includes('## 入门') || content.includes('## 安装') || content.includes('## 配置')) {
    result.type = 'Post';  // 教程类文章
    result.tags.push('教程', '指南');
  }
  else if (content.includes('## 思考') || content.includes('## 观点') || content.includes('## 感悟') || 
      content.includes('## 反思') || content.includes('## 总结') || content.includes('## 心得')) {
    result.type = 'Post';  // 思考类文章
    result.tags.push('思考', '感悟');
  }
  else if (content.includes('## 新闻') || content.includes('## 快讯') || content.includes('## 动态')) {
    result.type = 'Post';  // 新闻类文章
    result.tags.push('新闻', '资讯');
  }
  else if (content.includes('## 周报') || content.includes('## 日报') || content.includes('## 月报') || 
           content.includes('## 总结') || content.includes('## 计划')) {
    result.type = 'Post';  // 报告类文章
    result.tags.push('工作', '总结');
  }
  else if (content.includes('## 问题') || content.includes('## 分析') || content.includes('## 解决方案')) {
    result.type = 'Post';  // 分析类文章
    result.tags.push('问题', '分析');
  }
  
  // 确保返回的类型在 Notion 的选项中
  result.type = NOTION_TYPE_OPTIONS[result.type] || 'Post';
  
  // 如果没有匹配到任何类型，则添加默认标签
  if (result.tags.length === 0) {
    result.tags.push('未分类');
  }
  
  return result;
}

/**
 * 为 Markdown 文件添加或更新 frontmatter
 * @param {string} filePath - 文件路径
 * @returns {Promise<boolean>} 是否成功
 */
async function ensureFrontmatter(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const { data: frontmatter, content: markdownContent } = matter(content);
    
    // 检测文章类型
    const { type, tags } = detectArticleType(markdownContent);
    
    // 生成默认的 frontmatter
    const defaultFrontmatter = {
      title: path.basename(filePath, '.md'),
      date: new Date().toISOString().split('T')[0],
      type: type,
      tags: tags,
      status: 'published'
    };
    
    // 如果已经有 frontmatter，则保留现有的 type 和 tags
    if (frontmatter) {
      if (frontmatter.type && frontmatter.tags && frontmatter.tags.length > 0) {
        console.log(`✅ ${path.basename(filePath)} 已有 type: ${frontmatter.type}, tags: ${frontmatter.tags.join(', ')}`);
        return true;
      }
      
      // 如果只有 tags 没有 type，则根据 tags 设置 type
      if (frontmatter.tags && frontmatter.tags.length > 0) {
        const mainTag = frontmatter.tags[0];
        frontmatter.type = mainTag;
        console.log(`🔄 ${path.basename(filePath)} 根据 tags 设置 type: ${mainTag}`);
      }
    }
    
    // 合并现有的 frontmatter（如果有）
    const finalFrontmatter = { ...defaultFrontmatter, ...frontmatter };
    
    // 确保 tags 是数组
    if (!Array.isArray(finalFrontmatter.tags)) {
      finalFrontmatter.tags = finalFrontmatter.tags 
        ? [finalFrontmatter.tags] 
        : ['未分类'];
    }
    
    // 重新写入文件
    const newContent = matter.stringify(markdownContent, finalFrontmatter);
    await fs.writeFile(filePath, newContent, 'utf8');
    
    console.log(`✅ 已为 ${path.basename(filePath)} 添加 frontmatter`);
    return true;
    
  } catch (error) {
    console.error(`❌ 处理文件 ${filePath} 时出错:`, error);
    return false;
  }
}

/**
 * 处理单个 Markdown 文件
 * @param {string} filePath - 文件路径
 */
async function processFile(filePath) {
  try {
    // 确保 frontmatter 存在
    const hasFrontmatter = await ensureFrontmatter(filePath);
    if (!hasFrontmatter) {
      console.warn(`⚠️ 无法为 ${filePath} 添加 frontmatter`);
      return false;
    }
    
    // 读取文件内容
    const fileContent = await fs.readFile(filePath, 'utf8');
    const { content, data: frontmatter } = matter(fileContent);
    
    // 生成 Notion 块
    const blocks = [];
    
    // 添加标题
    if (frontmatter.title) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [{
            type: 'text',
            text: { content: frontmatter.title }
          }]
        }
      });
    }
    
    // 添加作者和日期信息
    const info = [];
    if (frontmatter.author) info.push(frontmatter.author);
    if (frontmatter.date) info.push(frontmatter.date);
    
    if (info.length > 0) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: info.join(' · ') },
            annotations: { italic: true }
          }]
        }
      });
    }
    
    // 添加分割线
    blocks.push({
      object: 'block',
      type: 'divider',
      divider: {}
    });
    
    // 处理内容
    const lines = content.split('\n');
    let currentParagraph = [];
    
    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const paragraphText = currentParagraph.join('\n').trim();
        if (paragraphText) {
          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{
                type: 'text',
                text: { content: paragraphText }
              }]
            }
          });
        }
        currentParagraph = [];
      }
    };
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // 处理标题
      if (trimmedLine.startsWith('#')) {
        flushParagraph();
        const level = trimmedLine.match(/^#+/)[0].length;
        if (level <= 3) {
          const headingText = trimmedLine.replace(/^#+\s*/, '').trim();
          blocks.push({
            object: 'block',
            type: `heading_${level}`,
            [`heading_${level}`]: {
              rich_text: [{
                type: 'text',
                text: { content: headingText }
              }]
            }
          });
        }
        continue;
      }
      
      // 处理列表项
      if (trimmedLine.match(/^[-*+]\s/)) {
        flushParagraph();
        const listItemText = trimmedLine.substring(2).trim();
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{
              type: 'text',
              text: { content: listItemText }
            }]
          }
        });
        continue;
      }
      
      // 处理空行
      if (!trimmedLine) {
        flushParagraph();
        continue;
      }
      
      // 将当前行添加到段落中
      currentParagraph.push(line);
    }
    
    // 确保最后一段被处理
    flushParagraph();
    
    // 去重处理：使用 Set 记录已经处理过的内容
    const contentSet = new Set();
    
    // 将 blocks 转换为 Notion 块数组，保留格式信息
    const notionBlocks = blocks.filter(block => {
      // 过滤掉空段落
      if (block.type === 'paragraph' && (!block.paragraph?.rich_text?.length || !block.paragraph.rich_text[0]?.text?.content?.trim())) {
        return false;
      }
      
      // 生成内容签名用于去重
      let contentSignature = '';
      try {
        contentSignature = JSON.stringify(block);
      } catch (e) {
        console.warn('无法序列化块内容:', block);
        return false;
      }
      
      // 如果内容已存在，则跳过
      if (contentSet.has(contentSignature)) {
        return false;
      }
      
      contentSet.add(contentSignature);
      return true;
    }).map(block => {
      // 处理标题
      if (block.type.startsWith('heading_')) {
        const level = parseInt(block.type.split('_')[1]);
        return {
          object: 'block',
          type: `heading_${Math.min(level, 3)}`,
          [`heading_${Math.min(level, 3)}`]: {
            rich_text: block[block.type].rich_text.map(richText => ({
              type: 'text',
              text: { 
                content: (richText.plain_text || richText.text?.content || '').replace(/\*\*/g, '') // 移除 ** 符号
              },
              annotations: {
                bold: richText.annotations?.bold || false,
                italic: richText.annotations?.italic || false,
                strikethrough: richText.annotations?.strikethrough || false,
                code: richText.annotations?.code || false,
                color: 'default'
              }
            }))
          }
        };
      }
      // 处理段落
      else if (block.type === 'paragraph') {
        return {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: block.paragraph.rich_text.map(richText => ({
              type: 'text',
              text: { 
                content: (richText.plain_text || richText.text?.content || '').replace(/\*\*/g, '') // 移除 ** 符号
              },
              annotations: {
                bold: richText.annotations?.bold || false,
                italic: richText.annotations?.italic || false,
                strikethrough: richText.annotations?.strikethrough || false,
                code: richText.annotations?.code || false,
                color: 'default'
              }
            }))
          }
        };
      }
      // 处理无序列表
      else if (block.type === 'bulleted_list_item') {
        return {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: block.bulleted_list_item.rich_text.map(richText => ({
              type: 'text',
              text: { 
                content: (richText.plain_text || richText.text?.content || '').replace(/\*\*/g, '') // 移除 ** 符号
              },
              annotations: {
                bold: richText.annotations?.bold || false,
                italic: richText.annotations?.italic || false,
                strikethrough: richText.annotations?.strikethrough || false,
                code: richText.annotations?.code || false,
                color: 'default'
              }
            }))
          }
        };
      }
      // 处理有序列表
      else if (block.type === 'numbered_list_item') {
        return {
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: {
            rich_text: block.numbered_list_item.rich_text.map(richText => ({
              type: 'text',
              text: { 
                content: (richText.plain_text || richText.text?.content || '').replace(/\*\*/g, '') // 移除 ** 符号
              },
              annotations: {
                bold: richText.annotations?.bold || false,
                italic: richText.annotations?.italic || false,
                strikethrough: richText.annotations?.strikethrough || false,
                code: richText.annotations?.code || false,
                color: 'default'
              }
            }))
          }
        };
      }
      // 处理分割线
      else if (block.type === 'divider') {
        return {
          object: 'block',
          type: 'divider',
          divider: {}
        };
      }
      // 处理引用
      else if (block.type === 'quote') {
        return {
          object: 'block',
          type: 'quote',
          quote: {
            rich_text: block.quote.rich_text.map(richText => ({
              type: 'text',
              text: { 
                content: (richText.plain_text || richText.text?.content || '').replace(/\*\*/g, '') // 移除 ** 符号
              },
              annotations: {
                bold: richText.annotations?.bold || false,
                italic: richText.annotations?.italic || false,
                strikethrough: richText.annotations?.strikethrough || false,
                code: richText.annotations?.code || false,
                color: 'default'
              }
            }))
          }
        };
      }
      // 处理待办事项
      else if (block.type === 'to_do') {
        return {
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: block.to_do.rich_text.map(richText => ({
              type: 'text',
              text: { 
                content: (richText.plain_text || richText.text?.content || '').replace(/\*\*/g, '') // 移除 ** 符号
              },
              annotations: {
                bold: richText.annotations?.bold || false,
                italic: richText.annotations?.italic || false,
                strikethrough: richText.annotations?.strikethrough || false,
                code: richText.annotations?.code || false,
                color: 'default'
              }
 })),
            checked: block.to_do.checked || false
          }
        };
      }
      // 默认返回原始块
      return block;
    });

    // 从 frontmatter 中移除 type 属性，避免在后续的展开操作中重复添加
    const { type, ...restFrontmatter } = frontmatter;
    
    // 准备页面属性
    const pageProperties = {
      title: frontmatter.title,
      slug: frontmatter.slug || frontmatter.title.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-'),
      tags: frontmatter.tags,
      status: frontmatter.status || 'published',
      type: {
        select: {
          name: frontmatter.type || 'Post'  // 确保 type 是 select 类型
        }
      }
    };
    
    console.log('准备创建页面，属性:', JSON.stringify(pageProperties, null, 2));
    
    // 创建或更新 Notion 页面
    try {
      // 确保 blocks 是有效的 Notion 块数组
      const validBlocks = notionBlocks.filter(block => {
        // 确保每个块都有必要的属性
        if (!block || !block.type) return false;
        
        // 确保富文本内容存在
        if (block[block.type]?.rich_text) {
          block[block.type].rich_text = block[block.type].rich_text.filter(rt => rt.text?.content);
          return block[block.type].rich_text.length > 0;
        }
        return true;
      });

      const page = await createOrUpdatePage({
        title: frontmatter.title,
        slug: frontmatter.slug || frontmatter.title.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-'),
        content: validBlocks,
        ...restFrontmatter, // 使用移除了 type 的 frontmatter
        type: {
          select: {
            name: frontmatter.type || 'Post'  // 确保 type 是 select 类型
          }
        }
      });
      
      console.log(`✅ 成功同步到 Notion: ${path.basename(filePath)}`);
      return true;
    } catch (error) {
      console.error(`❌ 同步到 Notion 失败: ${error}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ 处理文件 ${filePath} 时出错:`, error);
    return false;
  }
}

// 防抖控制
let syncTimeout;
let isSyncing = false;

// 执行同步
async function runSync(filePath) {
  if (isSyncing) {
    console.log('🔄 同步正在进行中，跳过此次触发');
    return;
  }

  isSyncing = true;
  const fileName = path.basename(filePath);
  console.log(`🔄 检测到文件变化，开始同步: ${fileName}`);
  
  try {
    await processFile(filePath);
    console.log(`✅ 同步成功: ${fileName}`);
  } catch (error) {
    console.error(`❌ 同步失败 (${fileName}):`, error.message);
  } finally {
    isSyncing = false;
  }
}

// 防抖函数
function debouncedSync(filePath) {
  // 忽略临时文件和隐藏文件
  const fileName = path.basename(filePath);
  if (fileName.startsWith('.') || fileName.startsWith('~$')) {
    return;
  }

  console.log(`📝 检测到文件变化: ${fileName}`);
  
  // 清除之前的计时器
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  
  // 设置新的计时器
  syncTimeout = setTimeout(() => {
    runSync(filePath).catch(console.error);
  }, CONFIG.debounceTime);
}

// 启动文件监听
function startWatching() {
  console.log(`👀 开始监听目录: ${CONFIG.contentDir}`);
  console.log('📌 按 Ctrl+C 停止监听');
  
  const watcher = chokidar.watch(CONFIG.contentDir, {
    ignored: (path) => {
      // 忽略临时文件、隐藏文件和非md文件
      const basename = path.split(/[\\/]/).pop();
      return (
        basename.startsWith('.') ||
        basename.startsWith('~$') ||
        !/\.md$/i.test(basename)
      );
    },
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100
    }
  });

  // 监听事件
  watcher
    .on('add', path => debouncedSync(path))
    .on('change', path => debouncedSync(path))
    .on('unlink', path => console.log(`🗑️  文件已删除: ${path}`))
    .on('error', error => console.error('监听错误:', error));

  // 处理进程退出
  process.on('SIGINT', () => {
    console.log('\n👋 停止监听');
    watcher.close().then(() => process.exit(0));
  });
}

async function main() {
  try {
    console.log('🚀 开始自动修复并同步到 Notion...');
    
    // 确保内容目录存在
    await ensureDirectoryExists(CONFIG.contentDir);
    
    if (CONFIG.watchMode) {
      // 监控模式
      startWatching();
    } else {
      // 单次执行模式
      const files = await getMarkdownFiles(CONFIG.contentDir);
      console.log(`📂 找到 ${files.length} 个 Markdown 文件`);
      
      let successCount = 0;
      for (const file of files) {
        try {
          await processFile(file);
          successCount++;
        } catch (error) {
          console.error(`❌ 处理文件 ${path.basename(file)} 失败:`, error.message);
        }
      }
      
      console.log(`\n✨ 自动修复并同步完成! 成功: ${successCount}/${files.length} 个文件`);
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ 发生错误:', error);
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
  ensureFrontmatter,
  processFile
};
