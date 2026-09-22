#!/usr/bin/env node
/**
 * 部署前同步脚本：把 _shared 的代码分发到各云函数目录。
 *
 * _shared/ 是唯一代码源（下划线前缀不会被微信开发者工具当云函数上传）：
 *   _shared/config.js  → <fn>/config.js
 *   _shared/lib/       → <fn>/lib/   （先整目录删除再拷贝，防残留旧文件）
 *
 * 用法：
 *   node tools/sync-shared.js            # 同步全部函数（含过渡期 nina-api）
 *   node tools/sync-shared.js nina-auth  # 只同步指定函数
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHARED = path.join(ROOT, 'cloudfunctions', '_shared');

const FNS = [
  'nina-api', // 过渡期金丝雀回退，e2e 通过后移除
  'nina-auth',
  'nina-import',
  'nina-content',
  'nina-analysis',
  'nina-insight',
  'nina-search',
];

const targets = process.argv.slice(2).length ? process.argv.slice(2) : FNS;

for (const fn of targets) {
  const fnDir = path.join(ROOT, 'cloudfunctions', fn);
  if (!fs.existsSync(fnDir)) {
    console.error(`[sync] 跳过：目录不存在 ${fn}`);
    continue;
  }
  // lib：整目录重建
  const libDest = path.join(fnDir, 'lib');
  fs.rmSync(libDest, { recursive: true, force: true });
  fs.cpSync(path.join(SHARED, 'lib'), libDest, { recursive: true });
  // config：单文件覆盖
  fs.cpSync(path.join(SHARED, 'config.js'), path.join(fnDir, 'config.js'));
  console.log(`[sync] ${fn}: lib/ + config.js 已同步`);
}
console.log(`[sync] 完成（${targets.length} 个函数）`);
