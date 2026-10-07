/**
 * LLM 客户端：火山方舟 OpenAI 兼容接口（/chat/completions）。
 * - json mode（response_format: json_object）+ JSON.parse 失败回喂重试 1 次
 * - ARK_API_KEY 只来自云函数环境变量，缺失时显式报错（内容接口不受影响）
 */
const { ARK_API_KEY, ARK_BASE_URL, ARK_MODEL, LLM_TIMEOUT_MS, LLM_MAX_TOKENS } = require('../config');
const { rawRequest, sleep } = require('./http');

class LlmError extends Error {}
class LlmNotConfiguredError extends LlmError {}

function ensureConfigured() {
  if (!ARK_API_KEY) {
    throw new LlmNotConfiguredError('LLM 未配置（缺少 ARK_API_KEY 环境变量）');
  }
}

/** 单次 chat 调用，返回 { text } */
async function chatOnce(messages, { jsonMode = false, thinking = true } = {}) {
  const body = {
    model: ARK_MODEL,
    messages,
    max_tokens: LLM_MAX_TOKENS,
    temperature: 0.4,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  // deepseek-v4.1-flash 等推理模型会先产出 reasoning_content，思考耗尽 token 预算导致 content 为空，
  // 显式关闭思考链；不识别该参数的模型若返回 400 则去掉参数重试一次
  if (!thinking) body.thinking = { type: 'disabled' };
  let res = await rawRequest({
    url: `${ARK_BASE_URL.replace(/\/$/, '')}/chat/completions`,
    method: 'POST',
    headers: { Authorization: `Bearer ${ARK_API_KEY}` },
    body,
    timeout: LLM_TIMEOUT_MS,
  });
  if (res.status === 400 && !thinking) {
    delete body.thinking;
    res = await rawRequest({
      url: `${ARK_BASE_URL.replace(/\/$/, '')}/chat/completions`,
      method: 'POST',
      headers: { Authorization: `Bearer ${ARK_API_KEY}` },
      body,
      timeout: LLM_TIMEOUT_MS,
    });
  }
  if (res.status !== 200) {
    throw new LlmError(`LLM http ${res.status}: ${String(res.raw || '').slice(0, 200)}`);
  }
  const choice = res.data && res.data.choices && res.data.choices[0];
  const text = choice && choice.message && choice.message.content;
  if (!text) throw new LlmError('LLM 回包缺少 content');
  return { text };
}

/**
 * chat：messages → 文本。
 */
async function llmChat(messages, opts = {}) {
  ensureConfigured();
  const { text } = await chatOnce(messages, { thinking: false, ...opts });
  return { text };
}

/**
 * chat JSON：要求模型输出 JSON；解析失败把错误回喂重试 1 次。
 */
async function llmChatJson(messages, opts = {}) {
  ensureConfigured();
  const sys = { role: 'system', content: '只输出合法 JSON，不要输出 markdown 代码块或其他说明文字。' };
  const msgs = [sys, ...messages];
  let first;
  try {
    first = await chatOnce(msgs, { jsonMode: true, thinking: false, ...opts });
  } catch (e) {
    await sleep(300);
    first = await chatOnce(msgs, { jsonMode: true, thinking: false, ...opts });
  }
  try {
    return { json: parseLoose(first.text) };
  } catch (e) {
    // 回喂重试：把解析错误告知模型
    const retryMsgs = [
      ...msgs,
      { role: 'assistant', content: first.text },
      { role: 'user', content: `上面的输出不是合法 JSON（错误：${e.message}）。请重新输出，只输出合法 JSON。` },
    ];
    const second = await chatOnce(retryMsgs, { jsonMode: true, thinking: false, ...opts });
    return { json: parseLoose(second.text) };
  }
}

/** 宽松解析：容忍 ```json 包裹 */
function parseLoose(text) {
  let t = String(text).trim();
  t = t.replace(/^```(json)?\s*/i, '').replace(/```\s*$/, '');
  const start = t.search(/[{[]/);
  if (start > 0) t = t.slice(start);
  return JSON.parse(t);
}

/** 输入压缩是否可用的标记（供 action 判断 50200） */
function isConfigured() {
  return Boolean(ARK_API_KEY);
}

module.exports = { llmChat, llmChatJson, isConfigured, LlmError, LlmNotConfiguredError, parseLoose };
