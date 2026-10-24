import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

process.env.XDG_CONFIG_HOME = `${process.cwd()}/.wrangler`;
process.env.WRANGLER_LOG_PATH = '.wrangler/logs';
process.env.CI = 'true';

console.log('🔄 正在重置本地 D1 数据库...');

// 1. 清理本地 SQLite 存储文件
const d1Dir = resolve(process.cwd(), '.wrangler/state/v3/d1');
try {
  await rm(d1Dir, { recursive: true, force: true });
  console.log('✅ 步骤 1/3: 已彻底清理本地 SQLite 历史数据文件。');
} catch {
  // 忽略已清理
}

// 2. 执行全新的数据库结构迁移 (0000 -> 0003)
console.log('📦 步骤 2/3: 正在执行全新数据库 Schema 迁移...');
execSync('pnpm exec wrangler d1 migrations apply DB --local', {
  stdio: 'inherit',
  env: {
    ...process.env,
    XDG_CONFIG_HOME: `${process.cwd()}/.wrangler`,
    WRANGLER_LOG_PATH: '.wrangler/logs',
    CI: 'true',
  },
});

// 3. 同步考研四科大纲、知识点精讲与题库
console.log('📚 步骤 3/3: 正在同步考研政治/英语/数学/408 知识点与习题数据...');
execSync('node --experimental-strip-types scripts/content-sync.ts --env local', {
  stdio: 'inherit',
  env: process.env,
});

console.log('\n========================================');
console.log('🎉 本地数据库已重置完毕！所有旧账号已清空。');
console.log('========================================\n');
console.log('👉 请运行以下命令创建全新的管理员账号（支持自定义名字与邮箱）：\n');
console.log('   pnpm admin create-user --name "你的名字" --email "admin@study.example.com"\n');
