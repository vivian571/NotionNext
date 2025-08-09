const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// 配置
const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');

console.log(`🔍 开始监控目录: ${POSTS_DIR}`);

// 确保目录存在
if (!fs.existsSync(POSTS_DIR)) {
  console.log(`创建目录: ${POSTS_DIR}`);
  fs.mkdirSync(POSTS_DIR, { recursive: true });
}

// 上次检查时间
let lastCheckTime = Date.now();

// 获取目录下所有文件的最后修改时间
function getFilesInfo(dir) {
  const files = fs.readdirSync(dir);
  const result = {};
  
  files.forEach(file => {
    if (file.startsWith('.')) return; // 忽略隐藏文件
    
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isFile() && file.endsWith('.md')) {
      result[filePath] = stats.mtimeMs;
    }
  });
  
  return result;
}

// 初始化文件状态
let fileStates = getFilesInfo(POSTS_DIR);

// 执行命令
function runCommand(command) {
  console.log(`\n🚀 执行命令: ${command}`);
  
  return new Promise((resolve, reject) => {
    const child = exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ 执行命令出错: ${error}`);
        return reject(error);
      }
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
      resolve(stdout);
    });
    
    // 超时处理
    setTimeout(() => {
      if (!child.killed) {
        console.error('❌ 命令执行超时');
        child.kill();
        reject(new Error('Command timeout'));
      }
    }, 30000); // 30秒超时
  });
}

// 处理文件变化
async function handleFileChange(filePath) {
  console.log(`\n🔄 检测到文件变化: ${path.basename(filePath)}`);
  
  try {
    // 1. 推送到 GitHub
    console.log('\n⬆️  正在推送到 GitHub...');
    await runCommand('git add .');
    await runCommand(`git commit -m "更新文章: ${path.basename(filePath)}"`);
    await runCommand('git push origin main');
    
    // 2. 上传到 Notion
    console.log('\n☁️  正在上传到 Notion...');
    await runCommand(`node scripts/upload-to-notion.js "${filePath}"`);
    
    console.log(`\n✅ 处理完成: ${path.basename(filePath)}`);
  } catch (error) {
    console.error(`\n❌ 处理文件时出错:`, error);
  }
}

// 检查文件变化
function checkForChanges() {
  const currentFiles = getFilesInfo(POSTS_DIR);
  const now = Date.now();
  
  // 检查新增或修改的文件
  for (const [filePath, mtime] of Object.entries(currentFiles)) {
    if (!fileStates[filePath] || fileStates[filePath] < mtime) {
      if (fileStates[filePath]) {
        console.log(`\n📝 文件已修改: ${path.basename(filePath)}`);
      } else {
        console.log(`\n📄 检测到新文件: ${path.basename(filePath)}`);
      }
      
      // 更新文件状态
      fileStates[filePath] = mtime;
      
      // 处理文件变化
      handleFileChange(filePath);
    }
  }
  
  // 检查删除的文件
  for (const filePath of Object.keys(fileStates)) {
    if (!fs.existsSync(filePath)) {
      console.log(`\n🗑️  文件已删除: ${path.basename(filePath)}`);
      delete fileStates[filePath];
    }
  }
  
  // 更新最后检查时间
  lastCheckTime = now;
}

// 开始监控
console.log('\n👀 开始监控文件变化... (按 Ctrl+C 退出)');

// 每3秒检查一次文件变化
setInterval(checkForChanges, 3000);

// 处理退出
process.on('SIGINT', () => {
  console.log('\n👋 停止监控');
  process.exit();
});
