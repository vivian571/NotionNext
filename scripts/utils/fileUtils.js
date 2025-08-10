const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * 递归获取目录下所有 Markdown 文件
 * @param {string} dir - 目录路径
 * @returns {Promise<string[]>} Markdown 文件路径数组
 */
async function getMarkdownFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name);
      return dirent.isDirectory() ? getMarkdownFiles(res) : res;
    })
  );
  return Array.prototype.concat(...files).filter(file => file.endsWith('.md'));
}

/**
 * 获取文件的最后修改时间
 * @param {string} filePath - 文件路径
 * @returns {Date | null} 最后修改时间
 */
function getFileMtime(filePath) {
  try {
    const stats = fsSync.statSync(filePath);
    return stats.mtime;
  } catch (error) {
    console.error(`获取文件修改时间失败: ${filePath}`, error);
    return null;
  }
}

/**
 * 读取文件内容
 * @param {string} filePath - 文件路径
 * @returns {Promise<{content: string, stats: fs.Stats}>} 文件内容和状态信息
 */
async function readFileWithStats(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);
    return { content, stats };
  } catch (error) {
    console.error(`读取文件失败: ${filePath}`, error);
    throw error;
  }
}

/**
 * 确保目录存在，如果不存在则创建
 * @param {string} dirPath - 目录路径
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`目录不存在，正在创建: ${dirPath}`);
      await fs.mkdir(dirPath, { recursive: true });
    } else {
      throw error;
    }
  }
}

module.exports = {
  getMarkdownFiles,
  getFileMtime,
  readFileWithStats,
  ensureDirectoryExists
};
