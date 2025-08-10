const { Client } = require('@notionhq/client');
require('dotenv').config({ path: `${__dirname}/../.env.local` });

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function testConnection() {
  try {
    console.log('正在测试 Notion API 连接...');
    
    // 测试获取用户信息
    const user = await notion.users.me({});
    console.log('✅ 成功连接到 Notion API');
    console.log('用户信息:', {
      id: user.id,
      name: user.name,
      email: user.person?.email || '无邮箱信息'
    });
    
    // 测试数据库访问
    const databaseId = process.env.DATABASE_ID || '2498a76030d980d1a3f5e70bba46eb66';
    console.log('\n正在测试数据库访问...');
    console.log('数据库ID:', databaseId);
    
    try {
      const database = await notion.databases.retrieve({ database_id: databaseId });
      console.log('✅ 成功访问数据库');
      console.log('数据库标题:', database.title[0]?.plain_text || '无标题');
      
      console.log('\n数据库属性:');
      Object.entries(database.properties).forEach(([key, prop]) => {
        console.log(`- ${key} (${prop.type})`);
      });
      
    } catch (dbError) {
      console.error('❌ 访问数据库失败:', dbError.message);
      console.error('请确保:');
      console.error('1. 数据库ID正确');
      console.error('2. 集成已添加到数据库');
      console.error('3. 数据库有正确的权限设置');
    }
    
  } catch (error) {
    console.error('❌ 连接 Notion API 失败:', error.message);
    console.error('请确保:');
    console.error('1. NOTION_TOKEN 环境变量已设置且有效');
    console.error('2. 网络连接正常');
    console.error('3. 集成已启用');
  }
}

testConnection();
