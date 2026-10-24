import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

try {
  await writeFile('.dev.vars', `BETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  console.log('已生成本地 .dev.vars（已被 Git 忽略）。');
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  console.log('保留现有 .dev.vars。');
}
