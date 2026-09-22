/**
 * 云函数侧配置：环境变量优先，缺省值兜底。
 * ARK_API_KEY / ARK_BASE_URL / ARK_MODEL 只在云函数控制台配置，绝不写入代码。
 */
function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

module.exports = {
  // 上游微信读书网关
  WEREAD_GATEWAY: 'https://i.weread.qq.com/api/agent/gateway',
  WEREAD_SKILL_VERSION: env('WEREAD_SKILL_VERSION', '1.0.4'),

  // 火山方舟（OpenAI 兼容）
  ARK_API_KEY: env('ARK_API_KEY', ''),
  ARK_BASE_URL: env('ARK_BASE_URL', 'https://ark.cn-beijing.volces.com/api/plan/v3'),
  ARK_MODEL: env('ARK_MODEL', 'deepseek-v4.1-flash'),

  // 长任务软预算：单次云函数调用内推进 job 的时间上限（callFunction 客户端超时 15s~60s 均安全）
  STEP_DEADLINE_MS: 9000,
  // 上游防限频：串行 + 最小间隔
  UPSTREAM_INTERVAL_MS: 250,
  // 上游 HTTP 超时与重试
  HTTP_TIMEOUT_MS: 8000,
  HTTP_RETRIES: 3,
  HTTP_BACKOFF_MS: 500,

  // LLM
  LLM_TIMEOUT_MS: 45000,
  LLM_MAX_TOKENS: 2048,
  LLM_CORPUS_MAX_CHARS: 12000,

  // 分页
  PAGE_SIZE_DEFAULT: 20,
  PAGE_SIZE_MAX: 100,

  ERR: {
    OK: 0,
    UNAUTHORIZED: 40100,
    FORBIDDEN: 40300,
    NOT_FOUND: 40400,
    BAD_PARAMS: 42200,
    TOO_MANY: 42900,
    INTERNAL: 50000,
    UPSTREAM: 50100,
    ANALYSIS_NOT_READY: 50200,
  },
};
