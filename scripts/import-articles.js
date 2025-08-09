const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { v4: uuidv4 } = require('uuid');

// 配置
const SOURCE_DIR = 'E:/WeChat Files/wxid_spbegk84gk7l22/FileStorage/File/2025-04/公众号写作';
const TARGET_DIR = path.join(__dirname, '..', 'content', 'posts');
const DEFAULT_AUTHOR = '您的名字'; // 设置默认作者

// 确保目标目录存在
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  console.log(`已创建目标目录: ${TARGET_DIR}`);
}

// 辅助函数：生成有效的文件名
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// 处理单个Markdown文件
function processMarkdownFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { data: frontmatter, content: markdownContent } = matter(content);
    
    // 提取标题（从文件名或内容）
    const title = frontmatter.title || path.basename(filePath, '.md');
    const slug = frontmatter.slug || generateSlug(title);
    
    // 创建新的frontmatter
    const newFrontmatter = {
      title: title,
      date: frontmatter.date || new Date().toISOString(),
      slug: slug,
      author: frontmatter.author || DEFAULT_AUTHOR,
      tags: frontmatter.tags || [],
      categories: frontmatter.categories || [],
      summary: frontmatter.summary || '',
      cover: frontmatter.cover || '',
      draft: frontmatter.draft || false,
      ...frontmatter
    };
    
    // 生成新的Markdown内容
    const newContent = matter.stringify(markdownContent, newFrontmatter);
    
    // 生成目标文件路径
    const targetFileName = `${slug}.md`.replace(/[^\w\u4e00-\u9fa5-.]/g, '-');
    const targetPath = path.join(TARGET_DIR, targetFileName);
    
    // 写入文件
    fs.writeFileSync(targetPath, newContent, 'utf-8');
    console.log(`✅ 已处理: ${filePath} -> ${targetPath}`);
    
    return targetPath;
  } catch (error) {
    console.error(`❌ 处理文件 ${filePath} 时出错:`, error.message);
    return null;
  }
}

// 主函数
function main() {
  try {
    // 读取源目录中的所有Markdown文件
    const files = fs.readdirSync(SOURCE_DIR)
      .filter(file => file.endsWith('.md'));
    
    if (files.length === 0) {
      console.log(`在 ${SOURCE_DIR} 中没有找到Markdown文件`);
      return;
    }
    
    console.log(`找到 ${files.length} 个Markdown文件，开始处理...`);
    
    // 处理每个文件
    const results = [];
    for (const file of files) {
      const sourcePath = path.join(SOURCE_DIR, file);
      const result = processMarkdownFile(sourcePath);
      if (result) results.push(result);
    }
    
    console.log(`\n✨ 处理完成! 成功处理 ${results.length}/${files.length} 个文件`);
    console.log(`文件已保存到: ${TARGET_DIR}`);
    
    return results;
  } catch (error) {
    console.error('❌ 处理过程中出错:', error);
    return [];
  }
}

// 执行
if (require.main === module) {
  main();
}

module.exports = { main };
