#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// 获取目录下的所有 Markdown 文件
function getMarkdownFiles(dir) {
  const files = [];
  
  function walk(directory) {
    const items = fs.readdirSync(directory, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(directory, item.name);
      
      if (item.isDirectory()) {
        walk(fullPath);
      } else if (item.isFile() && path.extname(item.name).toLowerCase() === '.md') {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

// 默认的 frontmatter 模板
const DEFAULT_FRONTMATTER = {
  title: '',
  date: new Date().toISOString().split('T')[0],
  status: 'Published',
  tags: [],
  slug: ''
};

/**
 * 生成 slug
 * @param {string} title - 标题
 * @returns {string} - 生成的 slug
 */
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 更新文件的 frontmatter
 * @param {string} filePath - 文件路径
 * @param {Object} options - 选项
 * @param {boolean} options.force - 是否强制更新已存在的字段
 */
async function updateFrontmatter(filePath, { force = false } = {}) {
  const content = fs.readFileSync(filePath, 'utf8');
  const { data: frontmatter, content: markdownContent } = matter(content);
  
  // 获取文件名（不含扩展名）作为默认标题
  const defaultTitle = path.basename(filePath, path.extname(filePath));
  
  // 准备新的 frontmatter
  const newFrontmatter = { ...DEFAULT_FRONTMATTER };
  
  // 如果文件已有 frontmatter，保留原有值
  if (Object.keys(frontmatter).length > 0) {
    Object.assign(newFrontmatter, frontmatter);
  }
  
  // 确保标题不为空
  if (!newFrontmatter.title) {
    newFrontmatter.title = defaultTitle;
  }
  
  // 生成 slug（如果不存在）
  if (!newFrontmatter.slug) {
    newFrontmatter.slug = generateSlug(newFrontmatter.title);
  }
  
  // 如果 frontmatter 没有变化，直接返回
  if (JSON.stringify(frontmatter) === JSON.stringify(newFrontmatter)) {
    console.log(`✅ 无需更新: ${filePath}`);
    return;
  }
  
  // 更新文件
  const updatedContent = matter.stringify(markdownContent, newFrontmatter, {
    lineWidth: -1, // 不自动换行
    language: 'yaml',
    lineEnding: '\n' // 统一使用 LF 换行符
  });
  
  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log(`✅ 已更新: ${filePath}`);
}

/**
 * 主函数
 */
async function main() {
  try {
    const postsDir = path.join(process.cwd(), 'content/posts');
    
    // 确保目录存在
    if (!fs.existsSync(postsDir)) {
      console.log(`❌ 目录不存在: ${postsDir}`);
      return;
    }
    
    // 获取所有 Markdown 文件
    const files = getMarkdownFiles(postsDir);
    
    if (files.length === 0) {
      console.log('❌ 未找到 Markdown 文件');
      return;
    }
    
    console.log(`找到 ${files.length} 个 Markdown 文件，开始处理...`);
    
    // 处理所有文件
    for (const file of files) {
      try {
        await updateFrontmatter(file);
      } catch (error) {
        console.error(`处理文件 ${file} 时出错:`, error.message);
      }
    }
    
    console.log('\n✨ 处理完成！');
  } catch (error) {
    console.error('\n❌ 发生错误:', error);
    process.exit(1);
  }
}

// 执行主函数
if (require.main === module) {
  main();
}
