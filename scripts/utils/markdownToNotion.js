/**
 * 将 Markdown 转换为 Notion 块
 * @param {string} markdown - Markdown 文本
 * @returns {Array} Notion 块数组
 */
async function markdownToNotionBlocks(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return [{
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: 'No content available' },
          annotations: {
            bold: false,
            italic: false,
            strikethrough: false,
            underline: false,
            code: false,
            color: 'default'
          }
        }]
      }
    }];
  }

  const blocks = [];
  const lines = markdown.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 处理标题
    if (line.startsWith('#')) {
      const level = line.match(/^#+/)[0].length;
      const content = line.replace(/^#+\s*/, '').trim();
      
      if (level <= 3) { // 只处理 h1-h3
        blocks.push({
          object: 'block',
          type: `heading_${level}`,
          [`heading_${level}`]: {
            rich_text: [{
              type: 'text',
              text: { content: content },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: 'default'
              }
            }]
          }
        });
        continue;
      }
    }

    // 处理列表项
    if (line.match(/^[-*+]\s/)) {
      const content = line.substring(2).trim();
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: content },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: 'default'
            }
          }]
        }
      });
      continue;
    }

    // 处理代码块
    if (line.startsWith('```')) {
      const language = line.substring(3).trim() || 'plain text';
      let codeContent = '';
      i++; // 跳过代码开始标记
      
      // 收集代码内容直到遇到结束标记
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeContent += lines[i] + '\n';
        i++;
      }
      
      blocks.push({
        object: 'block',
        type: 'code',
        code: {
          rich_text: [{
            type: 'text',
            text: { content: codeContent.trim() }
          }],
          language: language
        }
      });
      continue;
    }

    // 处理引用
    if (line.startsWith('> ')) {
      const content = line.substring(2).trim();
      blocks.push({
        object: 'block',
        type: 'quote',
        quote: {
          rich_text: [{
            type: 'text',
            text: { content: content },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: 'default'
            }
          }]
        }
      });
      continue;
    }

    // 处理分割线
    if (line.match(/^[-*_]{3,}$/)) {
      blocks.push({
        object: 'block',
        type: 'divider',
        divider: {}
      });
      continue;
    }

    // 默认处理为段落
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: line },
          annotations: {
            bold: line.includes('**') && line.split('**').length % 2 === 0,
            italic: line.includes('*') && line.split('*').length % 2 === 0,
            strikethrough: line.includes('~~') && line.split('~~').length % 2 === 0,
            code: line.includes('`') && line.split('`').length % 2 === 0,
            underline: false,
            color: 'default'
          }
        }]
      }
    });
  }

  return blocks;
}

module.exports = { markdownToNotionBlocks };
