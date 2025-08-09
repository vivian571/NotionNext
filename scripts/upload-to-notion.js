require('dotenv').config({ path: `${__dirname}/../.env.local` });

const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// --- Configuration ---
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.DATABASE_ID;
const POSTS_DIR = path.join(process.cwd(), 'content/posts');
const SYNC_TAG_NAME = 'SyncedFromMarkdown'; // 用于标识脚本创建的页面

// --- Notion Client Initialization ---
const notion = new Client({ auth: NOTION_TOKEN });

/**
 * 将Markdown文本块转换为Notion Blocks数组
 * @param {string} markdownContent - Markdown文本内容
 * @returns {Array} - Notion Blocks数组
 */
function markdownToNotionBlocks(markdownContent) {
  const blocks = [];
  const lines = markdownContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 标题
    if (line.startsWith('# ')) {
      blocks.push({ type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: line.substring(2) } }] } });
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: line.substring(3) } }] } });
    } else if (line.startsWith('### ')) {
      blocks.push({ type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: line.substring(4) } }] } });
    }
    // 无序列表
    else if (line.startsWith('- ')) {
      blocks.push({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: line.substring(2) } }] } });
    }
    // 有序列表
    else if (line.match(/^\d+\.\s/)) {
      blocks.push({ type: 'numbered_list_item', numbered_list_item: { rich_text: [{ type: 'text', text: { content: line.replace(/^\d+\.\s/, '') } }] } });
    }
    // 引用
    else if (line.startsWith('> ')) {
      blocks.push({ type: 'quote', quote: { rich_text: [{ type: 'text', text: { content: line.substring(2) } }] } });
    }
    // 代码块
    else if (line.startsWith('```')) {
      const lang = line.substring(3);
      let code = '';
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        code += lines[i] + '\n';
        i++;
      }
      blocks.push({ type: 'code', code: { rich_text: [{ type: 'text', text: { content: code.trim() } }], language: lang || 'javascript' } });
    }
    // 图片
    else if (line.startsWith('![')) {
      const match = line.match(/!\[(.*?)\]\((.*?)\)/);
      if (match) {
        blocks.push({ type: 'image', image: { external: { url: match[2] } } });
      }
    }
    // 空行
    else if (line.trim() === '') {
      blocks.push({ type: 'paragraph', paragraph: { rich_text: [] } });
    }
    // 段落
    else {
      blocks.push({ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: line } }] } });
    }
  }

  // 合并连续的列表项
  const mergedBlocks = [];
  let inBulletedList = false;
  let inNumberedList = false;

  for (const block of blocks) {
    if (block.type === 'bulleted_list_item') {
      if (!inBulletedList) {
        inBulletedList = true;
      }
      mergedBlocks.push(block);
    } else if (block.type === 'numbered_list_item') {
      if (!inNumberedList) {
        inNumberedList = true;
      }
      mergedBlocks.push(block);
    } else {
      inBulletedList = false;
      inNumberedList = false;
      mergedBlocks.push(block);
    }
  }

  return mergedBlocks;
}

/**
 * 创建或更新Notion页面
 * @param {object} fileData - 文件数据对象
 */
async function createOrUpdatePage(fileData) {
  const { title, content, slug, date, ...properties } = fileData;

  try {
    // 查找页面
    const { results } = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: { property: 'Slug', rich_text: { equals: slug } },
    });

    const pageExists = results.length > 0;
    const pageId = pageExists ? results[0].id : null;

    const pageProperties = {
      '名称': { title: [{ text: { content: title } }] },
      'Slug': { rich_text: [{ text: { content: slug } }] },
      '日期': { date: { start: new Date(date).toISOString() } },
      '状态': { select: { name: '已发布' } },
      '标签': { multi_select: [{ name: SYNC_TAG_NAME }] },
    };
    
    const blocks = markdownToNotionBlocks(content);

    if (pageExists) {
      // --- 更新页面 ---
      console.log(`🔄 更新页面: ${title}`);
      // 1. 更新属性
      await notion.pages.update({ page_id: pageId, properties: pageProperties });

      // 2. 删除旧内容
      const existingBlocks = await notion.blocks.children.list({ block_id: pageId });
      for (const block of existingBlocks.results) {
        await notion.blocks.delete({ block_id: block.id });
      }

      // 3. 添加新内容
      await notion.blocks.children.append({ block_id: pageId, children: blocks });

    } else {
      // --- 创建页面 ---
      console.log(`✨ 创建新页面: ${title}`);
      await notion.pages.create({
        parent: { database_id: DATABASE_ID },
        properties: pageProperties,
        children: blocks,
      });
    }
    return slug;
  } catch (error) {
    console.error(`❌ 处理文章 "${title}" 时出错:`, error.message);
    throw error;
  }
}

/**
 * 删除在Notion中存在但在本地已被删除的文章
 * @param {Array<string>} localSlugs - 本地所有文章的slug列表
 */
async function deleteMissingPages(localSlugs) {
  try {
    console.log('🗑️  正在检查并删除远程多余的文章...');
    const { results } = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: '标签',
        multi_select: {
          contains: SYNC_TAG_NAME,
        },
      },
    });

    for (const page of results) {
      const slugProperty = page.properties.Slug;
      if (slugProperty && slugProperty.rich_text.length > 0) {
        const remoteSlug = slugProperty.rich_text[0].text.content;
        if (!localSlugs.includes(remoteSlug)) {
          console.log(`  - 正在删除: ${page.properties.名称.title[0].text.content}`);
          await notion.pages.update({ page_id: page.id, archived: true }); // 归档页面
        }
      }
    }
  } catch (error) {
    console.error('❌ 删除远程文章时出错:', error.message);
  }
}


/**
 * 主函数 - 同步所有文章
 */
async function syncAllArticles() {
  console.log('🚀 开始同步Markdown文件到Notion...');
  
  if (!NOTION_TOKEN || !DATABASE_ID) {
    console.error('❌ 错误: 请确保在 .env.local 或环境变量中设置 NOTION_TOKEN 和 DATABASE_ID');
    process.exit(1);
  }

  try {
    // 1. 读取本地所有Markdown文件
    const files = fs.readdirSync(POSTS_DIR).filter(file => file.endsWith('.md'));
    if (files.length === 0) {
      console.log('🤷 没有找到Markdown文件，请在 content/posts 目录下添加.md文件');
      return;
    }

    const localSlugs = [];

    // 2. 遍历并处理每个文件
    for (const file of files) {
      const filePath = path.join(POSTS_DIR, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const { data: frontmatter, content } = matter(fileContent);

      const fileData = {
        title: frontmatter.title || path.basename(file, '.md'),
        slug: frontmatter.slug || path.basename(file, '.md').toLowerCase().replace(/\s+/g, '-'),
        date: frontmatter.date || new Date().toISOString(),
        content,
        ...frontmatter,
      };

      const slug = await createOrUpdatePage(fileData);
      localSlugs.push(slug);
    }
    
    // 3. 删除远程多余的文章
    await deleteMissingPages(localSlugs);

    console.log('✅ 同步完成!');
  } catch (error) {
    console.error('❌ 同步过程中发生严重错误:', error.message);
    process.exit(1);
  }
}

// --- Script Execution ---
if (require.main === module) {
  syncAllArticles();
}

module.exports = {
  syncAllArticles,
  markdownToNotionBlocks,
  createOrUpdatePage,
  deleteMissingPages
};
