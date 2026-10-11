#!/usr/bin/env node
/**
 * 云函数本地冒烟：stub wx-server-sdk，逐函数逐 action 触发。
 * 目标：抓 MODULE_NOT_FOUND / require 路径错误（真实 DB 行为不在覆盖范围，
 * stub 返回空数据，action 返回任意数字 code（含 42200/50200/50000）即视为「跑到了」）。
 *
 * 用法：node tools/smoke-cloud.js            # 冒烟全部函数
 *       node tools/smoke-cloud.js nina-auth  # 只冒烟指定函数
 */
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const STUB = path.join(__dirname, 'stubs', 'wx-server-sdk.js');

// wx-server-sdk → 本地 stub
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'wx-server-sdk') return STUB;
  return origResolve.call(this, request, ...args);
};

// action → 函数归属（与部署架构一致）
const ACTION_MAP = {
  'nina-auth': ['auth_login', 'user_profile', 'user_update_profile'],
  'nina-import': ['import_key', 'import_status', 'import_step', 'import_sync'],
  'nina-content': ['moments_list', 'moments_detail', 'categories', 'books_list', 'topics_list', 'topics_detail', 'share_cards'],
  'nina-analysis': ['analysis_run', 'analysis_status', 'analysis_step'],
  'nina-insight': [
    'discover_summary', 'tags_list', 'tags_detail', 'tags_feedback',
    'explore_overview', 'explore_knowledge', 'explore_interest', 'explore_thinking',
    'explore_long_term', 'explore_persona', 'explore_unknown', 'explore_map', 'knowledge_detail',
    'persona_feedback', 'unknown_feedback',
  ],
  'nina-search': ['search'],
};
// 过渡期单网关：全部 action
ACTION_MAP['nina-api'] = [...new Set(Object.values(ACTION_MAP).flat())];

const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ACTION_MAP);
let failed = false;

function clearFnCache(fnDir) {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(fnDir + path.sep) || key === path.join(fnDir, 'index.js')) delete require.cache[key];
  }
}

async function callMain(main, action) {
  const res = await main({ action, params: {} });
  return res;
}

(async () => {
  for (const fn of targets) {
    const fnDir = path.join(ROOT, 'cloudfunctions', fn);
    const actions = ACTION_MAP[fn];
    if (!actions) {
      console.error(`[smoke] 未知函数 ${fn}`);
      failed = true;
      continue;
    }
    clearFnCache(fnDir);

    let main;
    try {
      ({ main } = require(fnDir));
    } catch (e) {
      console.error(`[smoke] ${fn} ✗ 入口加载失败: ${e.message}`);
      failed = true;
      continue;
    }

    // 外来 action 隔离断言：用别域的 action，期望 40400（nina-api 全量网关用不存在的 action）
    const foreign = fn === 'nina-api' ? '__not_exist__' : fn === 'nina-search' ? 'auth_login' : 'search';
    let passed = 0;
    const problems = [];

    try {
      const res = await callMain(main, foreign);
      if (res && res.code === 40400) passed++;
      else problems.push(`隔离断言失败: ${foreign} → ${JSON.stringify(res)}`);
    } catch (e) {
      problems.push(`隔离断言异常: ${foreign} → ${e.stack || e.message}`);
    }

    for (const action of actions) {
      try {
        const res = await callMain(main, action);
        if (res && typeof res.code === 'number') passed++;
        else problems.push(`${action} → 非法回包 ${JSON.stringify(res)}`);
      } catch (e) {
        problems.push(`${action} → 抛异常: ${e.stack || e.message}`);
      }
    }

    if (problems.length) {
      failed = true;
      console.error(`[smoke] ${fn} ✗ ${passed}/${actions.length + 1} 通过`);
      problems.forEach((p) => console.error(`  - ${p}`));
    } else {
      console.log(`[smoke] ${fn} ✓ ${passed}/${actions.length + 1} 通过（含隔离断言）`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
