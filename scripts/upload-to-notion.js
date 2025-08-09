const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// 配置信息 - 从环境变量获取
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.DATABASE_ID;
const NOTION_PAGE_ID = process.env.NOTION_PAGE_ID;
const POSTS_DIR = path.join(process.cwd(), 'content/posts'); // 本地Markdown文件目录

// 初始化Notion客户端
const notion = new Client({ auth: NOTION_TOKEN });

/**
 * 处理单个Markdown文件
 * @param {string} filePath - Markdown文件路径
 */
async function processMarkdownFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { data: frontmatter, content } = matter(fileContent);
    
    // 确保有必要的元数据
    const title = frontmatter.title || path.basename(filePath, '.md');
    const slug = frontmatter.slug || path.basename(filePath, '.md').toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    // 创建或更新Notion页面
    await createOrUpdatePage({
      title,
      content,
      slug,
      date: frontmatter.date || new Date().toISOString(),
      ...frontmatter
    });
    
    console.log(`✅ 已处理: ${path.basename(filePath)}`);
    return true;
  } catch (error) {
    console.error(`❌ 处理文件 ${filePath} 时出错:`, error.message);
    return false;
  }
}

/**
 * 上传所有Markdown文件到Notion
 */
async function uploadMarkdownToNotion() {
  try {
    // 确保目录存在
    if (!fs.existsSync(POSTS_DIR)) {
      console.log(`目录 ${POSTS_DIR} 不存在，已创建`);
      fs.mkdirSync(POSTS_DIR, { recursive: true });
      return;
    }

    // 读取所有Markdown文件
    const files = fs.readdirSync(POSTS_DIR).filter(file => file.endsWith('.md'));
    
    if (files.length === 0) {
      console.log('没有找到Markdown文件，请在content/posts目录下添加.md文件');
      return;
    }
    
    for (const file of files) {
      const filePath = path.join(POSTS_DIR, file);
      await processMarkdownFile(filePath);
    }
  } catch (error) {
    console.error('❌ 处理文件时出错:', error);
  }
}

async function createOrUpdatePage({ title, content, slug, date, ...properties }) {
  if (!DATABASE_ID) {
    throw new Error('DATABASE_ID 未设置');
  }
  
  if (!title) {
    throw new Error('文章标题不能为空');
  }
  
  if (!slug) {
    throw new Error('Slug 不能为空');
  }

  try {
    // 验证数据库访问权限
    try {
      await notion.databases.retrieve({ database_id: DATABASE_ID });
    } catch (error) {
      throw new Error(`无法访问数据库 ${DATABASE_ID}，请检查：\n1. 数据库ID是否正确\n2. 集成是否有权限访问该数据库\n3. 数据库是否已分享给集成\n错误详情: ${error.message}`);
    }
    
    // 检查页面是否已存在
    const { results } = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: 'Slug',
        rich_text: {
          equals: slug
        }
      }
    });

    const pageData = {
      parent: { database_id: DATABASE_ID },
      properties: {
        '名称': {
          title: [
            {
              text: {
                content: title
              }
            }
          ]
        },
        'Slug': {
          rich_text: [
            {
              text: {
                content: slug
              }
            }
          ]
        },
        '日期': {
          date: {
            start: new Date(date || Date.now()).toISOString()
          }
        },
        '状态': {
          select: {
            name: '已发布'
          }
        },
        // 添加其他属性...
      },
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: content
                }
              }
            ]
          }
        }
      ]
    };

    if (results.length > 0) {
      // 更新现有页面
      await notion.pages.update({
        page_id: results[0].id,
        ...pageData
      });
      console.log(`  已更新: ${title}`);
    } else {
      // 创建新页面
      await notion.pages.create(pageData);
      console.log(`  已创建: ${title}`);
    }
  } catch (error) {
    console.error(`❌ 处理文章"${title}"时出错:`, error.message);
    throw error;
  }
}

// 执行上传
if (require.main === module) {
  if (!NOTION_TOKEN) {
    console.error('❌ 错误: 请设置NOTION_TOKEN环境变量');
    process.exit(1);
  }
  
  if (!DATABASE_ID) {
    console.error('❌ 错误: 请设置DATABASE_ID环境变量');
    process.exit(1);
  }
  
  // 检查是否传入了文件路径参数
  const filePath = process.argv[2];
  
  console.log('🚀 开始上传Markdown到Notion...');
  
  if (filePath) {
    // 处理单个文件
    console.log(`处理文件: ${filePath}`);
    processMarkdownFile(filePath)
      .then(success => {
        console.log(success ? '✨ 上传完成!' : '❌ 上传过程中出错');
      });
  } else {
    // 处理目录下所有文件
    console.log('未指定文件路径，将处理 content/posts 目录下所有Markdown文件');
    uploadMarkdownToNotion()
      .then(() => console.log('✨ 上传完成!'))
      .catch(err => console.error('❌ 上传过程中出错:', err));
  }
}

module.exports = { 
  uploadMarkdownToNotion,
  processMarkdownFile 
};
