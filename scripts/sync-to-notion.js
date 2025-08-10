#!/usr/bin/env node

'use strict';

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const matter = require('gray-matter');
const { ensureDirectoryExists, getMarkdownFiles, getFileMtime } = require('./utils/fileUtils');
const { createOrUpdatePage } = require('./utils/notionUtils');
const config = require('./config/config');

// 状态文件路径，用于增量同步
const STATE_FILE = path.join(__dirname, '.notion-sync-state.json');

/**
 * 加载同步状态
 * @returns {Promise<Object>} 同步状态
 */
async function loadSyncState() {
  try {
    const stateData = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(stateData);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {}; // 文件不存在时返回空状态
    }
    console.error('加载同步状态失败:', error);
    return {};
  }
}

/**
 * 保存同步状态
 * @param {Object} state - 要保存的状态
 */
async function saveSyncState(state) {
  try {
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('保存同步状态失败:', error);
  }
}

/**
 * 处理单个Markdown文件
 * @param {string} filePath - 文件路径
 * @param {Object} state - 同步状态
 * @returns {Promise<boolean>} 是否成功
 */
async function processMarkdownFile(filePath, state) {
  const relativePath = path.relative(process.cwd(), filePath);
  const fileMtime = getFileMtime(filePath);
  const fileState = state[relativePath];
  
  // 检查文件是否需要更新
  if (fileState && fileState.lastSynced >= fileMtime.getTime()) {
    console.log(`⏩ 跳过未修改文件: ${relativePath}`);
    return true;
  }
  
  try {
    const fileContent = fsSync.readFileSync(filePath, 'utf-8');
    const { data: frontmatter, content } = matter(fileContent);
    
    const title = frontmatter.title || path.basename(filePath, '.md');
    const slug = frontmatter.slug || path.basename(filePath, '.md')
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    await createOrUpdatePage({
      title,
      content,
      slug,
      date: frontmatter.date || new Date().toISOString(),
      ...frontmatter
    });
    
    // 更新状态
    state[relativePath] = {
      lastSynced: Date.now(),
      slug,
      title
    };
    
    console.log(`✅ 已同步: ${relativePath}`);
    return true;
  } catch (error) {
    console.error(`❌ 处理文件 ${relativePath} 时出错:`, error.message);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始同步到 Notion...');
  
  try {
    // 确保文章目录存在
    await ensureDirectoryExists(config.paths.posts);
    
    // 加载同步状态
    const state = await loadSyncState();
    
    // 获取所有 Markdown 文件
    const files = await getMarkdownFiles(config.paths.posts);
    
    if (files.length === 0) {
      console.log('ℹ️ 没有找到 Markdown 文件，请在 content/posts 目录下添加 .md 文件');
      return;
    }
    
    console.log(`📂 找到 ${files.length} 个 Markdown 文件`);
    
    // 处理每个文件
    let successCount = 0;
    for (const file of files) {
      const success = await processMarkdownFile(file, state);
      if (success) successCount++;
      
      // 保存状态，以便在出错时不会丢失进度
      await saveSyncState(state);
    }
    
    console.log(`\n✨ 同步完成! 成功: ${successCount}/${files.length} 个文件`);
    
  } catch (error) {
    console.error('❌ 同步过程中出现错误:', error);
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
  main,
  processMarkdownFile
};
