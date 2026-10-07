/**
 * nina-http 云函数侧配置：环境变量优先，缺省值兜底。
 * ARK_API_KEY / ARK_BASE_URL / ARK_MODEL 只在云函数控制台配置，绝不写入代码。
 */
function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

module.exports = {
  // 火山方舟（OpenAI 兼容）
  ARK_API_KEY: env('ARK_API_KEY', ''),
  ARK_BASE_URL: env('ARK_BASE_URL', 'https://ark.cn-beijing.volces.com/api/plan/v3'),
  ARK_MODEL: env('ARK_MODEL', 'deepseek-v4.1-flash'),

  // 上游 LLM 请求超时
  LLM_TIMEOUT_MS: 60000,

  // Key 桥接票据 TTL（内存 Map，不落库）
  BRIDGE_TTL_MS: 10 * 60 * 1000,

  ERR: {
    UPSTREAM: 50100,
    INTERNAL: 50000,
  },
};
