/**
 * nina-http：HTTP 云函数（常驻 Web 服务，scf_bootstrap 启动，监听 0.0.0.0:9000）。
 *
 * 路由（SSE 帧格式统一 `data: <json>\n\n`，结束帧 `data: [DONE]\n\n`）：
 * - GET  /healthz    非流式 JSON {ok, uptime}
 * - GET  /sse/demo   每 300ms 推一条 {seq,text} 共 20 条后 [DONE]
 * - POST /llm/stream body {messages:[{role,content}]} 或 {prompt}，ARK 流式透传
 * - GET  /bridge       Key 桥接 H5（?ticket=32位hex，引导微信读书授权→提交 KEY）
 * - POST /bridge/key   body {ticket, key} 写入内存 Map（TTL 10min，不落库）
 * - GET  /bridge/poll  ?ticket= → {status:'pending'|'received', key?}
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

// ---------- Key 桥接（内存中转，不落库、不打日志） ----------

/**
 * ticket(32位hex) -> { key, ts }
 * 小程序生成 ticket，微信浏览器桥接页提交 Key，小程序轮询取走。
 * TTL 惰性清扫，命中不删（留重试），靠过期回收。
 */
const bridgeStore = new Map();

const TICKET_RE = /^[a-f0-9]{32}$/;
const WR_KEY_RE = /^wrk-[A-Za-z0-9]+$/;

function cleanBridgeStore() {
  const now = Date.now();
  for (const [t, v] of bridgeStore) {
    if (now - v.ts > config.BRIDGE_TTL_MS) bridgeStore.delete(t);
  }
}

function handleBridgePage(req, res, search) {
  const ticket = new URLSearchParams(search || '').get('ticket');
  if (!TICKET_RE.test(ticket || '')) {
    writeJson(res, 400, { error: { code: config.ERR.INTERNAL, message: 'ticket 无效' } });
    return;
  }
  const body = buildBridgeHtml(ticket);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function handleBridgeKey(req, res) {
  readBody(req)
    .then((raw) => {
      let body = {};
      try {
        body = JSON.parse(raw || '{}');
      } catch (e) {
        writeJson(res, 400, { ok: false, message: 'invalid json body' });
        return;
      }
      if (!TICKET_RE.test(body.ticket || '')) {
        writeJson(res, 400, { ok: false, message: 'ticket 无效' });
        return;
      }
      if (typeof body.key !== 'string' || !WR_KEY_RE.test(body.key)) {
        writeJson(res, 400, { ok: false, message: 'KEY 格式无效（需 wrk- 开头）' });
        return;
      }
      cleanBridgeStore();
      bridgeStore.set(body.ticket, { key: body.key, ts: Date.now() });
      writeJson(res, 200, { ok: true });
    })
    .catch(() => {
      writeJson(res, 400, { ok: false, message: 'read body failed' });
    });
}

function handleBridgePoll(req, res, search) {
  const ticket = new URLSearchParams(search || '').get('ticket');
  if (!TICKET_RE.test(ticket || '')) {
    writeJson(res, 400, { error: { code: config.ERR.INTERNAL, message: 'ticket 无效' } });
    return;
  }
  cleanBridgeStore();
  const entry = bridgeStore.get(ticket);
  if (entry) {
    writeJson(res, 200, { status: 'received', key: entry.key });
  } else {
    writeJson(res, 200, { status: 'pending' });
  }
}

// ---------- 桥接 H5（自包含，零外部依赖） ----------

function buildBridgeHtml(ticket) {
  const WEREAD_URL = 'https://weread.qq.com/r/weread-skills';
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>NINA · KEY 桥接</title>
<style>
  :root {
    --bg: #FCFCFC; --bg-secondary: #F4F6F8; --bg-card: #FFFFFF;
    --text-primary: #1A1D24; --text-secondary: #6B7280; --text-tertiary: #9CA3AF;
    --separator: #ECF0F4; --accent: #4890F0; --btn-primary-bg: #17181C;
    --radius-card: 16px; --radius-input: 12px;
    --shadow-card: 0 1px 3px rgba(23,28,38,.04), 0 8px 24px rgba(23,28,38,.06);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--text-primary);
    font-family: -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 420px; margin: 0 auto; padding: 48px 24px calc(48px + env(safe-area-inset-bottom)); }
  .logo { font-size: 15px; font-weight: 700; letter-spacing: .12em; color: var(--text-tertiary); margin-bottom: 20px; }
  h1 { font-size: 24px; font-weight: 700; line-height: 1.4; margin-bottom: 8px; }
  .sub { font-size: 14px; color: var(--text-secondary); line-height: 1.7; margin-bottom: 28px; }
  .card {
    background: var(--bg-card); border: 1px solid var(--separator);
    border-radius: var(--radius-card); box-shadow: var(--shadow-card);
    padding: 20px; margin-bottom: 24px;
  }
  .steps { list-style: none; }
  .steps li { display: flex; gap: 12px; padding: 10px 0; font-size: 14px; line-height: 1.65; }
  .steps li + li { border-top: 1px solid var(--separator); }
  .step-num {
    flex: 0 0 24px; height: 24px; border-radius: 999px; background: var(--bg-secondary);
    color: var(--text-secondary); font-size: 13px; font-weight: 600;
    display: flex; align-items: center; justify-content: center; margin-top: 2px;
  }
  .steps b { display: block; font-size: 14px; }
  .steps span { color: var(--text-secondary); font-size: 13px; }
  .btn {
    display: flex; width: 100%; height: 48px; align-items: center; justify-content: center;
    border-radius: 999px; border: none; font-size: 16px; font-weight: 600;
    font-family: inherit; cursor: pointer; margin-bottom: 12px; padding: 0 24px;
  }
  .btn.primary { background: var(--btn-primary-bg); color: var(--bg); }
  .btn.ghost { background: transparent; color: var(--text-primary); border: 1px solid var(--separator); }
  .btn.accent { background: var(--accent); color: #fff; }
  .btn:disabled { opacity: .5; }
  .hidden { display: none !important; }
  .paste-box { margin-top: 4px; }
  .paste-box input {
    width: 100%; height: 44px; border: 1px solid var(--separator); border-radius: var(--radius-input);
    background: var(--bg-secondary); padding: 0 14px; font-size: 14px; font-family: inherit; margin-bottom: 12px;
  }
  .err { color: #d54941; font-size: 13px; margin: 8px 0; }
  .hint { font-size: 13px; color: var(--text-secondary); line-height: 1.7; margin-bottom: 16px; }
  .done-view { text-align: center; padding: 32px 0; }
  .done-icon {
    width: 64px; height: 64px; border-radius: 999px; background: var(--bg-secondary);
    border: 1px solid var(--separator); color: var(--accent); font-size: 30px;
    display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;
  }
  .done-view p { font-size: 15px; color: var(--text-secondary); line-height: 1.8; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">NINA</div>
  <div id="view-main">
    <h1>微信读书 KEY 桥接</h1>
    <p class="sub">把你的微信读书 API KEY 安全地交给 NINA。KEY 只在中转内存停留 10 分钟，随后自动清除。</p>
    <div class="card">
      <ol class="steps">
        <li><span class="step-num">1</span><div><b>打开授权页</b><span>点击下方按钮，进入微信读书官方授权页</span></div></li>
        <li><span class="step-num">2</span><div><b>登录并生成 KEY</b><span>微信快捷登录后，点击生成 API KEY</span></div></li>
        <li><span class="step-num">3</span><div><b>复制 KEY</b><span>长按复制生成的 wrk- 开头的 KEY</span></div></li>
        <li><span class="step-num">4</span><div><b>回到本页导入</b><span>返回本页，一键提交给 NINA</span></div></li>
      </ol>
    </div>
    <button class="btn primary" onclick="gotoWeread()">打开微信读书授权页</button>
    <button class="btn ghost" id="submit-btn" onclick="submitClipboard()">我已复制 KEY，导入 NINA</button>
    <div class="paste-box hidden" id="paste-box">
      <input id="key-input" type="text" placeholder="粘贴 wrk- 开头的 KEY" autocapitalize="off" autocorrect="off">
      <button class="btn primary" onclick="submitPasted()">提交</button>
    </div>
    <p class="err hidden" id="err"></p>
  </div>
  <div id="view-done" class="done-view hidden">
    <div class="done-icon">✓</div>
    <p><b style="color:var(--text-primary)">KEY 已提交，导入已开始</b><br>请切回 NINA 小程序查看导入进度。</p>
  </div>
</div>
<script>
  var TICKET = '${ticket}';
  var WEREAD_URL = '${WEREAD_URL}';
  var KEY_RE = /^wrk-[A-Za-z0-9]+$/;
  var leftOnce = false;

  function $(id) { return document.getElementById(id); }

  function showError(msg) {
    var el = $('err');
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  function clearError() { $('err').classList.add('hidden'); }

  function gotoWeread() {
    leftOnce = true;
    location.href = WEREAD_URL;
  }

  // 用户从 weread 返回（bfcache / 切页）→ 主按钮切为「重新打开」，提交按钮高亮
  function onReturn() {
    if (!leftOnce) return;
    var btn = document.querySelector('.btn.primary');
    if (btn && btn.getAttribute('onclick') === 'gotoWeread()') {
      btn.textContent = '重新打开微信读书授权页';
    }
    var submit = $('submit-btn');
    submit.classList.remove('ghost');
    submit.classList.add('accent');
  }

  window.addEventListener('pageshow', function (e) { if (e.persisted) onReturn(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') onReturn();
  });

  function submitKey(key) {
    clearError();
    key = (key || '').trim();
    if (!KEY_RE.test(key)) {
      showError('KEY 格式无效：需为 wrk- 开头的字符串');
      return;
    }
    fetch('/bridge/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: TICKET, key: key })
    }).then(function (res) {
      if (res.ok) {
        $('view-main').classList.add('hidden');
        $('view-done').classList.remove('hidden');
      } else {
        return res.json().then(function (j) { showError((j && j.message) || '提交失败，请重试'); });
      }
    }).catch(function () { showError('网络错误，请重试'); });
  }

  function submitClipboard() {
    clearError();
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (text) {
        if (KEY_RE.test((text || '').trim())) {
          submitKey(text);
        } else {
          showPaste('剪贴板里没有找到 wrk- 开头的 KEY，请手动粘贴');
        }
      }).catch(function () { showPaste(''); });
    } else {
      showPaste('');
    }
  }

  function showPaste(msg) {
    if (msg) showError(msg);
    $('paste-box').classList.remove('hidden');
    $('key-input').focus();
  }

  function submitPasted() {
    submitKey($('key-input').value);
  }
</script>
</body>
</html>`;
}

// ---------- 入口 ----------

const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  try {
    if (path === '/healthz') return handleHealthz(req, res);
    if (path === '/sse/demo') return handleSseDemo(req, res);
    if (path === '/llm/stream') return handleLlmStream(req, res);
    if (path === '/bridge') return handleBridgePage(req, res, (req.url || '').split('?')[1]);
    if (path === '/bridge/key') return handleBridgeKey(req, res);
    if (path === '/bridge/poll') return handleBridgePoll(req, res, (req.url || '').split('?')[1]);
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
