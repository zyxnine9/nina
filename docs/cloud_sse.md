# NINA HTTP 云函数（SSE）使用说明

> 函数：`nina-http`（HTTP 类型 / Web 服务，Node 18.15）
> 用途：SSE 流式通道。当前提供 Demo 流 + ARK（火山方舟）LLM 流式透传，为后续对话/打字机效果打底。
> 状态：2026-09-23 已部署并端到端验证通过。

## 1. 架构

```
小程序                          云函数 nina-http                    上游
────────                       ──────────────────────              ─────
wx.cloud.callHTTPFunction  →   常驻 http server (0.0.0.0:9000)
  enableChunked: true          ├─ GET  /healthz   非流式 JSON
  onChunkedReceived(res)   ←   ├─ GET  /sse/demo   20 帧 × 300ms
                               └─ POST /llm/stream ──── https.request ──→ ARK
                                   逐行解析上游 SSE，           /chat/completions
                                   重封 data:{"delta":...}      stream:true
```

- HTTP 云函数是**常驻 Web 服务**（`scf_bootstrap` 启动，监听 9000 端口），与 `nina-*` 事件函数（callFunction）是两套体系：
  - 代码自包含（`cloudfunctions/nina-http/`），**不依赖 `cloudfunctions/_shared/`**，改它不需要跑 `sync-shared.js`，也不进 `smoke-cloud.js` 事件函数冒烟
  - 必须用 `wx.cloud.callHTTPFunction` 调用（基础库 **≥ 3.15.1**），免域名白名单，SSE 无需额外配置

## 2. 云函数实现

```
cloudfunctions/nina-http/
├── scf_bootstrap    # #!/bin/bash + exec /var/lang/node18/bin/node index.js
│                    # ⚠️ 必须 LF 结尾 + 可执行权限（chmod +x）
├── package.json     # 零 npm 依赖（原生 http/https，规避 remote-npm-install 风险）
├── config.js        # env() 读 ARK_API_KEY / ARK_BASE_URL / ARK_MODEL（不写死密钥）
└── index.js         # 路由 + SSE 封帧 + ARK 流式透传
```

### SSE 帧格式（统一约定）

```
data: <json>\n\n      # 每个 JSON 事件一行
data: [DONE]\n\n      # 结束帧
```

- 响应头：`Content-Type: text/event-stream; charset=utf-8` + `Cache-Control: no-cache` + `Connection: keep-alive`
- 中文 UTF-8 直接 write，前端负责解码（无需文档示例的 escape hack）
- `/llm/stream` 请求体：`{messages:[{role,content},...]}` 或简写 `{prompt}`（包装成单条 user）
- 上游错误 → 帧 `data:{"error":{code,message}}` 后关闭；前端 `onError` 收到
- 客户端断连（`req.on('close')`）→ abort 上游请求、清理定时器

### 路由行为

| 路由 | 行为 |
|------|------|
| `GET /healthz` | 非流式 JSON `{ok:true, uptime}`，用于连通性 + 函数类型验证 |
| `GET /sse/demo` | 每 300ms 一帧 `{seq,text}` 共 20 帧 + `[DONE]`，约 6.5s |
| `POST /llm/stream` | ARK `stream:true` 透传：抽上游 `choices[0].delta.content` 重封为 `{delta}` 帧 |

## 3. 前端使用方式

封装在 `api/sse.js`，函数名取根 `config.js` 的 `cloudHttpFunctionName: 'nina-http'`。

```js
import { callHttpFunction, streamSSE } from '~/api/sse';

// 1) 非流式调用
const data = await callHttpFunction({ path: '/healthz' });

// 2) SSE 流式调用
const stream = streamSSE({
  path: '/llm/stream',
  method: 'POST',
  data: { prompt: '用一句话介绍你自己' },   // 或 { messages: [...] }
  onEvent: (obj) => {
    if (typeof obj.delta === 'string') {
      // LLM 增量文本 → 追加渲染（建议节流 setData，见 dev 页 100ms 攒 buffer 做法）
    }
  },
  onDone: () => {},   // 收到 [DONE]
  onError: (err) => {}, // 网络错误 / SSE error 帧 / 看门狗触发
});

// 需要时取消
stream.cancel();
```

节流渲染参考 `pages/dev/cloud/index.js`：chunk 先攒 `sseBuffer`，每 ~100ms `setData` 刷一次，避免逐字 setData 卡顿。

## 4. 部署

wechatide CLI 的 `cloud_fn_deploy` **只能创建事件函数**（实测建成 Node 16），HTTP 函数用 tcb CLI：

```bash
# 1. 准备部署目录（envVariables 含密钥，只放 /tmp，不进仓库）
/tmp/nina-deploy/
├── cloudbaserc.json   # envId + functions[]: name/timeout/envVariables
└── functions/nina-http/   # 拷贝 cloudfunctions/nina-http 四个文件

# 2. 登录（首次；device 授权，本机已登录可跳过）
npx -y -p @cloudbase/cli tcb login --flow device

# 3. 部署（--force 覆盖已有函数代码+配置，不改函数类型）
cd /tmp/nina-deploy
npx -y -p @cloudbase/cli tcb fn deploy nina-http --httpFn --force --deployMode zip
```

`cloudbaserc.json` 关键字段：

```json
{
  "envId": "cloudbase-d7g7rfps86982b7da",
  "functionRoot": "functions",
  "functions": [{
    "name": "nina-http",
    "timeout": 60,
    "memorySize": 256,
    "installDependency": false,
    "envVariables": {
      "ARK_API_KEY": "<与 nina-content 相同>",
      "ARK_BASE_URL": "https://ark.cn-beijing.volces.com/api/plan/v3",
      "ARK_MODEL": "deepseek-v4.1-flash"
    }
  }]
}
```

环境变量改动也可在**云开发控制台 → 云函数 → nina-http → 函数配置**修改（超时时间同处，当前 60s）。

## 5. ⚠️ 注意事项（实测踩坑）

1. **`wx.cloud.callHTTPFunction` 返回值是 null**：`onChunkedReceived` / `onHeadersReceived` 必须作为**顶层参数**传入，不是返回 task 上的方法（挂到返回值上收不到任何 chunk）。
2. **小程序环境没有 `TextDecoder`**：chunk 的 `res.data` 是 ArrayBuffer，需自实现 UTF-8 增量解码——字节缓冲 + 截掉尾部不完整多字节序列 + `String.fromCharCode(每字节)` 拼 latin1 串 + `escape/decodeURIComponent` 解码。中文被 chunk 边界截断必须处理，`api/sse.js` 的 `createUtf8Decoder` 已实现并单测。
3. **平台强断流时 success/fail 都不回调**：函数超时被杀时流会静默挂起（实测卡在 13 帧不动）。`streamSSE` 内置 **20s 无数据看门狗** → 触发 `onError`。
4. **函数超时默认 3s**，流式必被卡断：已在控制台调到 **60s**（LLM 流式 + 首字延迟需 ≥ 30s）。用 `wechatide cloud_fn_info --names nina-http` 可查当前 timeout。
5. **callHTTPFunction 的 `timeout` 参数**（文档要求 < 1500ms，当前传 1400）实测不是硬请求超时，传 1400 流仍持续到达——勿把它当流时长上限。
6. **基础库 ≥ 3.15.1**：`project.config.json` 的 `libVersion` 已升 `3.15.1`（SSE 最低要求）；`onChunkedReceived` 不存在时 `streamSSE` 会直接报错提示。
7. chunk 粘包/拆包：一个 chunk 可能含多个 SSE 帧或半帧，必须按 `\n\n` 分帧并跨 chunk 缓冲（`api/sse.js` 的 `feed` 已处理）。
8. 不要把 `nina-http` 当事件函数部署：wechatide `cloud_fn_deploy` 会把它建成 Node 16 事件函数导致 `callHTTPFunction` 报 400；如误建，需控制台删除后用 tcb CLI 重建（或控制台手动建 HTTP 函数上传 zip）。

## 6. 验证路径

1. 本地：`node --check index.js`、`bash -n scf_bootstrap`、`node index.js` + `curl -N localhost:9000/sse/demo`
2. 模拟器：编译模式 `devCloud` 进 `pages/dev/cloud/index`，依次点 `/healthz` → `Demo 流` → `LLM 流式`，观察输出区逐帧增长、中文无乱码、console 无 error
3. 数据佐证：`automation_evaluate` 内 async 轮询采样 `p.data.sseOutput.length`，流进行中长度应阶梯增长
