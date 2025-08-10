#!/usr/bin/env node

'use strict';

// 加载环境变量
require('dotenv').config({ path: `${__dirname}/../.env` });

const chokidar = require('chokidar');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');
const execAsync = promisify(require('child_process').exec);

// 配置
const CONFIG = {
  postsDir: path.join(process.cwd(), 'content', 'posts'),
  syncScript: path.join(__dirname, 'auto-fix-and-sync.js'),
  ignoredFiles: ['.DS_Store', 'node_modules', '.git', '*.tmp', '~*', '*.swp', '*.swx'],
  debounceTime: 1500, // 防抖时间(毫秒)
  syncTimeout: 30000  // 同步超时时间(毫秒)
};

// 状态控制
let syncTimeout;
let isSyncing = false;
let pendingFiles = new Set();

/**
 * 执行同步脚本
 * @param {string} filePath - 要同步的文件路径
 */
async function runSync(filePath) {
  if (isSyncing) {
    console.log('🔄 同步正在进行中，将稍后处理:', path.basename(filePath));
    pendingFiles.add(filePath);
    return;
  }

  isSyncing = true;
  const fileName = path.basename(filePath);
  console.log(`🔄 开始同步: ${fileName}`);
  
  try {
    // 使用 execAsync 替代回调方式
    const { stdout, stderr } = await execAsync(`node "${CONFIG.syncScript}" "${filePath}"`, { 
      timeout: CONFIG.syncTimeout,
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });
    
    if (stdout) console.log(stdout.trim());
    if (stderr) console.error('⚠️', stderr.trim());
    
    console.log(`✅ 同步完成: ${fileName}`);
    
    // 处理等待中的文件
    if (pendingFiles.size > 0) {
      const nextFile = Array.from(pendingFiles).pop();
      pendingFiles.delete(nextFile);
      await runSync(nextFile);
    }
  } catch (error) {
    console.error(`❌ 同步失败 (${fileName}):`, error.message);
    if (error.stdout) console.error('输出:', error.stdout);
    if (error.stderr) console.error('错误:', error.stderr);
  } finally {
    isSyncing = false;
  }
}

/**
 * 防抖函数
 * @param {string} filePath - 变化的文件路径
 */
function debouncedSync(filePath) {
  // 忽略临时文件、隐藏文件和非md文件
  const fileName = path.basename(filePath);
  const shouldIgnore = CONFIG.ignoredFiles.some(pattern => {
    if (pattern.startsWith('*')) {
      return fileName.endsWith(pattern.substring(1));
    }
    return fileName === pattern || filePath.includes(pattern);
  });

  if (shouldIgnore) {
    console.log(`⏭️  忽略文件: ${fileName}`);
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

/**
 * 启动文件监听
 */
async function startWatching() {
  console.log(`👀 开始初始化文件监听器...`);
  console.log(`📂 监听目录: ${CONFIG.postsDir}`);
  console.log('📌 按 Ctrl+C 停止监听');
  
  // 检查目录是否存在
  try {
    const stats = await fs.stat(CONFIG.postsDir);
    if (!stats.isDirectory()) {
      console.error(`❌ 错误: ${CONFIG.postsDir} 不是目录`);
      process.exit(1);
    }
    console.log(`✅ 目录存在: ${CONFIG.postsDir}`);
  } catch (error) {
    console.error(`❌ 无法访问目录 ${CONFIG.postsDir}:`, error.message);
    console.log('正在尝试创建目录...');
    try {
      await fs.mkdir(CONFIG.postsDir, { recursive: true });
      console.log(`✅ 已创建目录: ${CONFIG.postsDir}`);
    } catch (mkdirError) {
      console.error(`❌ 创建目录失败: ${mkdirError.message}`);
      process.exit(1);
    }
  }
  
  const watcher = chokidar.watch(CONFIG.postsDir, {
    ignored: (filePath) => {
      const fileName = path.basename(filePath);
      return CONFIG.ignoredFiles.some(pattern => {
        if (pattern.startsWith('*')) {
          return fileName.endsWith(pattern.substring(1));
        }
        return fileName === pattern || filePath.includes(pattern);
      }) || !/\.md$/i.test(fileName);
    },
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100
    },
    usePolling: process.platform === 'win32' // Windows 系统使用轮询
  });

    // 监听事件
  watcher
    .on('add', filePath => {
      console.log(`📄 [${new Date().toISOString()}] 添加文件: ${filePath}`);
      debouncedSync(filePath);
    })
    .on('change', filePath => {
      console.log(`✏️  [${new Date().toISOString()}] 修改文件: ${filePath}`);
      debouncedSync(filePath);
    })
    .on('ready', () => {
      console.log(`✅ [${new Date().toISOString()}] 文件监听器已就绪`);
      console.log(`📁 正在监听目录: ${CONFIG.postsDir}`);
      console.log('🔍 正在等待文件变化...');
    })
    .on('unlink', filePath => {
      console.log(`🗑️  删除文件: ${path.basename(filePath)}`);
      // 这里可以添加删除 Notion 中对应页面的逻辑
    })
    .on('addDir', dirPath => {
      console.log(`📁 添加目录: ${path.relative(process.cwd(), dirPath)}`);
    })
    .on('unlinkDir', dirPath => {
      console.log(`🗑️  删除目录: ${path.relative(process.cwd(), dirPath)}`);
    })
    .on('error', error => {
      console.error('❌ 监听错误:', error);
    });

  // 处理进程退出
  process.on('SIGINT', async () => {
    console.log('\n👋 正在停止监听...');
    try {
      await watcher.close();
      console.log('✅ 监听已停止');
      process.exit(0);
    } catch (error) {
      console.error('❌ 停止监听时出错:', error);
      process.exit(1);
    }
  });

  console.log('✅ 文件监听器已启动');
}

/**
 * 检查并安装依赖
 */
async function checkDependencies() {
  const requiredDeps = ['chokidar', 'gray-matter'];
  const missingDeps = [];

  // 检查缺少的依赖
  for (const dep of requiredDeps) {
    try {
      require.resolve(dep);
    } catch (error) {
      missingDeps.push(dep);
    }
  }

  if (missingDeps.length > 0) {
    console.log(`❌ 缺少依赖: ${missingDeps.join(', ')}`);
    console.log('正在安装依赖...');
    
    try {
      const { stdout, stderr } = await execAsync(`npm install ${missingDeps.join(' ')} --save`);
      if (stdout) console.log(stdout.trim());
      if (stderr) console.error(stderr.trim());
      console.log('✅ 依赖安装完成');
      startWatching();
    } catch (error) {
      console.error('❌ 安装依赖失败:', error.message);
      if (error.stdout) console.error('输出:', error.stdout);
      if (error.stderr) console.error('错误:', error.stderr);
      process.exit(1);
    }
  } else {
    startWatching();
  }
}

// 启动
(async () => {
  try {
    console.log('🚀 启动 Notion 同步监控服务...');
    console.log('🔍 检查系统环境...');
    
    // 检查并安装依赖
    await checkDependencies();
    
    // 启动文件监控
    await startWatching();
    
    // 初始同步所有文件
    console.log('🔄 执行初始文件同步...');
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const { stdout, stderr } = await execAsync(`node "${CONFIG.syncScript}"`);
      if (stdout) console.log(stdout.trim());
      if (stderr) console.error(stderr.trim());
      
      console.log('✅ 初始同步完成');
    } catch (error) {
      console.error('⚠️ 初始同步失败:', error.message);
      if (error.stdout) console.error('输出:', error.stdout);
      if (error.stderr) console.error('错误:', error.stderr);
    }
    
  } catch (error) {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  }
})();
