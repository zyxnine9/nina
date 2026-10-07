/**
 * 微信读书 Key 桥接：小程序侧工具。
 *
 * 流程：本页生成 ticket(32位hex) → 复制桥接链接 → 用户去微信浏览器打开
 * 桥接 H5（nina-http GET /bridge）→ weread 授权页生成/复制 Key → H5 一键
 * POST /bridge/key → 本页每 2s GET /bridge/poll 轮询命中。
 * Key 只经 nina-http 内存 Map 中转（TTL 10min），不落库。
 */
import config from '~/config';
import { callHttpFunction } from './sse';

/**
 * 生成 32 位 hex 随机 ticket（桥接会话标识）。
 * 小程序无法用 crypto.getRandomValues，用 Math.random + 时间戳凑随机性。
 */
export function genTicket() {
  let out = '';
  for (let i = 0; i < 32; i += 1) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return `${Date.now().toString(16).slice(-12).padStart(12, '0')}${out.slice(12)}`;
}

/** 桥接 H5 链接（复制给用户去微信浏览器打开） */
export function bridgeUrl(ticket) {
  // bridgeBaseUrl 未配置时：mock 模式用占位域名保证链接完整可复制（仅演示）；
  // 真实模式不该走到这里（key-tutorial 会降级为纯教程）
  const base = (config.bridgeBaseUrl || (config.isMock ? 'https://nina-bridge.demo' : '')).replace(/\/+$/, '');
  return `${base}/bridge?ticket=${ticket}`;
}

/** 复制桥接链接到剪贴板 */
export function copyBridgeLink(ticket) {
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: bridgeUrl(ticket),
      success: resolve,
      fail: reject,
    });
  });
}

/**
 * 轮询桥接服务：KEY 是否已被提交。
 * 返回 {status:'pending'} 或 {status:'received', key}
 */
export async function pollBridge(ticket) {
  if (config.isMock) {
    // mock 模式：8s 后返回演示 key，方便 UI 开发
    return new Promise((resolve) => {
      const elapsed = Date.now() - (mockStart[ticket] || (mockStart[ticket] = Date.now()));
      if (elapsed > 8000) {
        resolve({ status: 'received', key: 'wrk-mockdemo0123456789abcdef' });
      } else {
        resolve({ status: 'pending' });
      }
    });
  }
  const res = await callHttpFunction({ path: `/bridge/poll?ticket=${ticket}` });
  return res && typeof res === 'object' ? res : { status: 'pending' };
}

const mockStart = {};
