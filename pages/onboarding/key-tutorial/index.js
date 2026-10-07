import config from '~/config';
import { callAction } from '~/api/request';
import { genTicket, copyBridgeLink, pollBridge } from '~/api/bridge';

const POLL_INTERVAL = 2000;

Page({
  data: {
    state: 'guide', // guide | waiting | received
    bridgeReady: false,
    demoMode: false,
    maskKey: '',
  },

  ticket: '',
  pollTimer: null,
  submitting: false,

  onLoad() {
    this.setData({
      bridgeReady: Boolean(config.bridgeBaseUrl) || config.isMock,
      // 桥接服务未部署时 mock 演示模式：链接为占位域名，轮询返回演示 KEY
      demoMode: config.isMock && !config.bridgeBaseUrl,
    });
  },

  onShow() {
    if (this.data.state === 'waiting') this.startPoll();
  },

  onHide() {
    this.stopPoll();
  },

  onUnload() {
    this.stopPoll();
  },

  onCopyBridgeLink() {
    this.ticket = genTicket();
    copyBridgeLink(this.ticket)
      .then(() => {
        wx.showToast({ title: '链接已复制', icon: 'success' });
        this.setData({ state: 'waiting' });
        this.startPoll();
      })
      .catch(() => {
        wx.showToast({ title: '复制失败，请重试', icon: 'none' });
      });
  },

  startPoll() {
    this.stopPoll();
    this.pollTimer = setInterval(() => this.tick(), POLL_INTERVAL);
  },

  stopPoll() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  async tick() {
    if (!this.ticket) return;
    try {
      const res = await pollBridge(this.ticket);
      if (res.status === 'received' && res.key) {
        this.stopPoll();
        // 只展示尾号确认，不完整回显 KEY
        const key = res.key;
        this.setData({ state: 'received', maskKey: `${key.slice(0, 4)}••••••${key.slice(-4)}` });
        this.pendingKey = key;
      }
    } catch (err) {
      // 单次轮询失败不中断，下一轮继续
    }
  },

  onConfirmImport() {
    const key = this.pendingKey;
    if (!key || this.submitting) return;
    this.submitting = true;

    // mock 模式下没有真实云函数，直接进导入页（导入页有本地模拟）
    if (config.isMock) {
      wx.redirectTo({ url: '/pages/onboarding/importing/index?mock=1' });
      return;
    }

    callAction('import_key', { key })
      .then((res) => {
        const data = (res.data && res.data.data) || {};
        wx.redirectTo({ url: `/pages/onboarding/importing/index?importId=${data.importId || ''}` });
      })
      .catch((err) => {
        this.submitting = false;
        const msg = (err && err.data && err.data.message) || 'KEY 校验失败';
        wx.showModal({
          title: '导入失败',
          content: msg,
          confirmText: '重新走一遍',
          showCancel: false,
          success: () => this.setData({ state: 'guide' }),
        });
      });
  },

  onManualInput() {
    this.stopPoll();
    wx.navigateTo({ url: '/pages/onboarding/key-input/index' });
  },

  onRetry() {
    this.pendingKey = '';
    this.setData({ state: 'guide', maskKey: '' });
  },
});
