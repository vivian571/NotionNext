const chokidar = require('chokidar');
const { exec } = require('child_process');
const path = require('path');
const postsDir = path.join(__dirname, '..', 'content', 'posts');

console.log(`开始监控目录: ${postsDir}`);

// 初始化文件监控
const watcher = chokidar.watch(postsDir, {
  ignored: /(^|[\/\\])\../, // 忽略隐藏文件
  persistent: true,
  ignoreInitial: true
});

// 防抖函数
const debounce = (func, wait) => {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

// 执行 Git 命令
const runGitCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
      if (error) {
        console.error(`执行命令出错: ${error}`);
        return reject(error);
      }
      console.log(stdout);
      if (stderr) console.error(stderr);
      resolve(stdout);
    });
  });
};

// 处理文件变化
const handleFileChange = async (filePath) => {
  const fileName = path.basename(filePath);
  console.log(`检测到文件变化: ${fileName}`);
  
  try {
    // 添加文件到 Git
    await runGitCommand(`git add "${filePath}"`);
    
    // 提交更改
    await runGitCommand(`git commit -m "更新文章: ${fileName}"`);
    
    // 推送到远程仓库
    await runGitCommand('git push origin main');
    
    console.log(`✅ 成功提交并推送更改: ${fileName}`);
    
    // 调用 Notion 上传脚本
    exec(`node scripts/upload-to-notion.js "${filePath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error('上传到 Notion 时出错:', error);
        return;
      }
      console.log('✅ 成功上传到 Notion');
      console.log(stdout);
    });
  } catch (error) {
    console.error('处理文件变化时出错:', error);
  }
};

// 使用防抖处理文件变化
const debouncedHandleChange = debounce(handleFileChange, 1000);

// 监听事件
watcher
  .on('add', debouncedHandleChange)
  .on('change', debouncedHandleChange)
  .on('error', error => console.error(`监控出错: ${error}`));

console.log('监控已启动，按 Ctrl+C 退出...');
