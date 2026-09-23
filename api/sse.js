/**
 * HTTP 云函数调用 + SSE 流式封装。
 *
 * 依赖 wx.cloud.callHTTPFunction（基础库 >= 3.15.1）：
 * - 普通调用：Promise 化回包
 * - 流式调用：顶层传 enableChunked + onChunkedReceived 接收 SSE
 *   （帧格式 `data: <json>\n\n`，结束帧 `data: [DONE]\n\n`）
 *
 * ⚠️ 小程序无 TextDecoder：用字节缓冲处理跨 chunk 的 UTF-8 多字节字符，
 *    解码走 String.fromCharCode(每字节) + escape/decodeURIComponent。
 */
import config from '~/config';

const HTTP_TIMEOUT_MS = 1400; // 文档要求 timeout < 1500ms
const STALL_TIMEOUT_MS = 20000; // 连续无数据的看门狗阈值（防平台强断后 success/fail 均不回调的静默挂起）

function assertCloud() {
  if (!wx.cloud) {
    throw new Error('基础库过低，不支持 wx.cloud');
  }
  wx.cloud.init({ env: config.envId, traceUser: true });
}

/**
 * 非流式调用 HTTP 云函数。
 * callHttpFunction({ path, method, data, header }) -> Promise<any>
 */
export function callHttpFunction({ path, method = 'GET', data, header }) {
  assertCloud();
  return new Promise((resolve, reject) => {
    wx.cloud.callHTTPFunction({
      name: config.cloudHttpFunctionName,
      path,
      method,
      data,
      header,
      timeout: HTTP_TIMEOUT_MS,
      success: (res) => resolve(res.data),
      fail: reject,
    });
  });
}

/**
 * UTF-8 增量解码器（字节缓冲）：
 * feed(arrayBuffer) 返回当前已完整解码的文本，不完整的多字节尾部留待下次。
 */
function createUtf8Decoder() {
  let pending = [];

  function decodeBytes(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    // latin1 二进制串 -> UTF-8
    return decodeURIComponent(escape(binary));
  }

  // 返回截掉「不完整多字节尾部」后的安全长度
  function safeEnd(bytes) {
    const len = bytes.length;
    for (let i = len - 1; i >= 0 && i >= len - 4; i -= 1) {
      const b = bytes[i];
      if ((b & 0xc0) === 0x80) continue; // 连续字节，继续往前找 lead byte
      if ((b & 0xe0) === 0xc0) return len - i >= 2 ? len : i;
      if ((b & 0xf0) === 0xe0) return len - i >= 3 ? len : i;
      if ((b & 0xf8) === 0xf0) return len - i >= 4 ? len : i;
      return len; // ASCII
    }
    return len;
  }

  return {
    feed(arrayBuffer) {
      const incoming = new Uint8Array(arrayBuffer);
      let text = '';
      if (pending.length) {
        const merged = new Uint8Array(pending.length + incoming.length);
        merged.set(pending, 0);
        merged.set(incoming, pending.length);
        pending = [];
        const end = safeEnd(merged);
        text = decodeBytes(merged.subarray(0, end));
        if (end < merged.length) {
          pending = Array.from(merged.subarray(end));
        }
      } else {
        const end = safeEnd(incoming);
        text = decodeBytes(incoming.subarray(0, end));
        if (end < incoming.length) {
          pending = Array.from(incoming.subarray(end));
        }
      }
      return text;
    },
  };
}

/**
 * SSE 流式调用。
 * streamSSE({ path, method, data, onEvent, onDone, onError }) -> { cancel() }
 * - onEvent(obj)：每个 `data: <json>` 帧
 * - onDone()：收到 [DONE]
 * - onError(err)：网络错误或 SSE 帧携带 { error }
 */
export function streamSSE({ path, method = 'GET', data, onEvent, onDone, onError }) {
  assertCloud();
  let cancelled = false;
  let buf = '';
  const decoder = createUtf8Decoder();
  let stallTimer = setTimeout(() => {
    if (!cancelled && onError) {
      onError({ errMsg: `stream stalled: no data for ${STALL_TIMEOUT_MS / 1000}s（检查函数超时配置/服务端是否存活）` });
    }
    cancelled = true;
  }, STALL_TIMEOUT_MS);

  function stopStall() {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  }

  function feed(text) {
    buf += text;
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (!line) continue;
      if (line === '[DONE]') {
        stopStall();
        if (onDone) onDone();
        return true; // 结束
      }
      try {
        const obj = JSON.parse(line);
        if (obj && obj.error) {
          stopStall();
          if (onError) onError(obj.error);
          return true;
        }
        if (onEvent) onEvent(obj);
      } catch (e) {
        // 非 JSON 帧，忽略
      }
    }
    return false;
  }

  function resetStall() {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      if (!cancelled && onError) {
        onError({ errMsg: `stream stalled: no data for ${STALL_TIMEOUT_MS / 1000}s（检查函数超时配置/服务端是否存活）` });
      }
      cancelled = true;
    }, STALL_TIMEOUT_MS);
  }

  const handleChunked = (res) => {
    if (cancelled) return;
    const arrayBuffer = res.data || res.arrayBuffer || res.chunk;
    if (!arrayBuffer) return;
    resetStall();
    const ended = feed(decoder.feed(arrayBuffer));
    if (ended) {
      stopStall();
      cancelled = true;
    }
  };

  const handleFail = (err) => {
    stopStall();
    if (!cancelled && onError) onError(err);
  };

  wx.cloud.callHTTPFunction({
    name: config.cloudHttpFunctionName,
    path,
    method,
    data,
    header: { Accept: 'text/event-stream' },
    timeout: HTTP_TIMEOUT_MS,
    enableChunked: true,
    onHeadersReceived: () => {},
    onChunkedReceived: handleChunked,
    success: () => {
      // 流式模式下 success 表示响应结束；[DONE] 帧已在 onChunkedReceived 处理
    },
    fail: handleFail,
  });

  return {
    cancel() {
      cancelled = true;
      stopStall();
    },
  };
}
