/**
 * nina-http：HTTP 云函数（常驻 Web 服务，scf_bootstrap 启动，监听 0.0.0.0:9000）。
 *
 * 路由（SSE 帧格式统一 `data: <json>\n\n`，结束帧 `data: [DONE]\n\n`）：
 * - GET  /healthz    非流式 JSON {ok, uptime}
 * - GET  /sse/demo   每 300ms 推一条 {seq,text} 共 20 条后 [DONE]
 * - POST /llm/stream body {messages:[{role,content}]} 或 {prompt}，ARK 流式透传
 *
 * 零 npm 依赖：原生 http/https。小程序端用 wx.cloud.callHTTPFunction 调用，
 * enableChunked + onChunkedReceived 接收 SSE。
 */
const http = require('http');
const https = require('https');
const config = require('./config');

const PORT = 9000;

// ---------- 工具 ----------

function writeSSEHead(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

function writeEvent(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function writeDone(res) {
  res.write('data: [DONE]\n\n');
}

function writeJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 512 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// ---------- 路由 ----------

function handleHealthz(req, res) {
  writeJson(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
}

function handleSseDemo(req, res) {
  writeSSEHead(res);
  let seq = 0;
  const timer = setInterval(() => {
    seq += 1;
    writeEvent(res, { seq, text: `第 ${seq} 条流式数据 · 打字机效果演示` });
    if (seq >= 20) {
      clearInterval(timer);
      writeDone(res);
      res.end();
    }
  }, 300);
  req.on('close', () => {
    clearInterval(timer);
  });
}

function handleLlmStream(req, res) {
  readBody(req)
    .then((raw) => {
      let body = {};
      try {
        body = JSON.parse(raw || '{}');
      } catch (e) {
        writeJson(res, 400, { error: { code: config.ERR.INTERNAL, message: 'invalid json body' } });
        return;
      }
      let messages = body.messages;
      if (!Array.isArray(messages) || messages.length === 0) {
        const prompt = typeof body.prompt === 'string' ? body.prompt : '';
        if (!prompt) {
          writeJson(res, 400, { error: { code: config.ERR.INTERNAL, message: 'messages 或 prompt 必填' } });
          return;
        }
        messages = [{ role: 'user', content: prompt }];
      }

      if (!config.ARK_API_KEY) {
        writeSSEHead(res);
        writeEvent(res, {
          error: { code: config.ERR.UPSTREAM, message: '未配置 ARK_API_KEY 环境变量' },
        });
        writeDone(res);
        res.end();
        return;
      }

      proxyLlmStream(messages, req, res);
    })
    .catch((err) => {
      writeJson(res, 400, { error: { code: config.ERR.INTERNAL, message: err.message } });
    });
}

// ARK /chat/completions stream:true → 逐行解析上游 SSE，重封帧写给客户端
function proxyLlmStream(messages, req, res) {
  const url = new URL(`${config.ARK_BASE_URL.replace(/\/$/, '')}/chat/completions`);
  const payload = JSON.stringify({
    model: config.ARK_MODEL,
    messages,
    stream: true,
    max_tokens: 2048,
  });

  const upstream = https.request(
    {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Bearer ${config.ARK_API_KEY}`,
      },
      timeout: config.LLM_TIMEOUT_MS,
    },
    (uRes) => {
      if (uRes.statusCode !== 200) {
        let errBody = '';
        uRes.on('data', (c) => {
          errBody += c.toString('utf-8');
          if (errBody.length > 4096) uRes.destroy();
        });
        uRes.on('end', () => {
          writeSSEHead(res);
          writeEvent(res, {
            error: {
              code: config.ERR.UPSTREAM,
              message: `ARK ${uRes.statusCode}: ${errBody.slice(0, 500)}`,
            },
          });
          writeDone(res);
          res.end();
        });
        return;
      }

      writeSSEHead(res);
      let buf = '';

      uRes.on('data', (chunk) => {
        buf += chunk.toString('utf-8');
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).replace(/\r$/, '');
          buf = buf.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            writeDone(res);
            res.end();
            return;
          }
          try {
            const json = JSON.parse(data);
            const delta = json.choices && json.choices[0] && json.choices[0].delta
              ? json.choices[0].delta.content || ''
              : '';
            if (delta) writeEvent(res, { delta });
          } catch (e) {
            // 跳过非 JSON 帧
          }
        }
      });

      uRes.on('end', () => {
        // 上游没发 [DONE] 就断流：兜底收尾
        if (!res.writableEnded) {
          writeDone(res);
          res.end();
        }
      });
      uRes.on('error', () => {
        if (!res.writableEnded) {
          writeEvent(res, { error: { code: config.ERR.UPSTREAM, message: 'upstream read error' } });
          res.end();
        }
      });
    }
  );

  upstream.on('timeout', () => {
    upstream.destroy(new Error('upstream timeout'));
  });
  upstream.on('error', (err) => {
    if (!res.writableEnded) {
      writeSSEHead(res);
      writeEvent(res, { error: { code: config.ERR.UPSTREAM, message: err.message } });
      writeDone(res);
      res.end();
    }
  });

  // 客户端断连 → abort 上游
  req.on('close', () => {
    if (!res.writableEnded) upstream.destroy();
  });

  upstream.write(payload);
  upstream.end();
}

// ---------- 入口 ----------

const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  try {
    if (path === '/healthz') return handleHealthz(req, res);
    if (path === '/sse/demo') return handleSseDemo(req, res);
    if (path === '/llm/stream') return handleLlmStream(req, res);
    return writeJson(res, 404, { error: { code: config.ERR.INTERNAL, message: `no route: ${path}` } });
  } catch (err) {
    try {
      writeJson(res, 500, { error: { code: config.ERR.INTERNAL, message: err.message } });
    } catch (e) {
      res.end();
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`nina-http listening on 0.0.0.0:${PORT}`);
});
