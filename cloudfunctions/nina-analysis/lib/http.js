/**
 * Node https 请求 Promise 封装：超时、JSON 解析、指数退避重试。
 * 重试条件：网络错误 / 5xx / 429；401/403、4xx 业务错误不重试。
 */
const https = require('https');
const { URL } = require('url');

function rawRequest({ url, method = 'POST', headers = {}, body = null, timeout = 8000 }) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return reject(new Error(`invalid url: ${url}`));
    }
    const payload = body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      headers: { ...headers },
      timeout,
    };
    if (payload != null) {
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch (e) {
          data = null;
        }
        resolve({ status: res.statusCode, data, raw });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`request timeout (${timeout}ms)`));
    });
    req.on('error', reject);
    if (payload != null) req.write(payload);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 带退避重试的 JSON POST */
async function postJsonRetry({
  url,
  headers = {},
  body = {},
  timeout = 8000,
  retries = 3,
  backoffMs = 500,
  shouldRetry,
}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await rawRequest({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body,
        timeout,
      });
      if (res.status >= 200 && res.status < 300) return res;
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`http ${res.status}`);
        lastErr.status = res.status;
        lastErr.retryable = true;
      } else {
        // 4xx 不重试，直接返回给上层分类处理
        return res;
      }
    } catch (e) {
      lastErr = e;
      lastErr.retryable = true;
    }
    if (attempt < retries) await sleep(backoffMs * Math.pow(2, attempt));
  }
  throw lastErr || new Error('request failed');
}

module.exports = { rawRequest, postJsonRetry, sleep };
