import { callAction } from '~/api/request';

const KEY_RE = /^wrk-[A-Za-z0-9]+$/;

Page({
  data: {
    key: '',
    clipKey: '',
    submitting: false,
  },

  onKeyInput(e) {
    this.setData({ key: e.detail.value });
  },

  // 聚焦时检测剪贴板是否已有 KEY
  onKeyFocus() {
    wx.getClipboardData({
      success: (res) => {
        const text = (res.data || '').trim();
        if (KEY_RE.test(text) && text !== this.data.key) {
          this.setData({ clipKey: text });
        } else {
          this.setData({ clipKey: '' });
        }
      },
      fail: () => {},
    });
  },

  onFillFromClipboard() {
    if (!this.data.clipKey) return;
    this.setData({ key: this.data.clipKey, clipKey: '' });
  },

  onSubmit() {
    const key = this.data.key.trim();
    if (!KEY_RE.test(key)) {
      wx.showToast({ title: 'KEY 需以 wrk- 开头', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    callAction('import_key', { key })
      .then((res) => {
        const data = (res.data && res.data.data) || {};
        wx.redirectTo({ url: `/pages/onboarding/importing/index?importId=${data.importId || ''}` });
      })
      .catch((err) => {
        this.setData({ submitting: false });
        const msg = (err && err.data && err.data.message) || 'KEY 校验失败，请检查后重试';
        wx.showModal({ title: '导入失败', content: msg, showCancel: false });
      });
  },

  onTutorial() {
    wx.navigateTo({ url: '/pages/onboarding/key-tutorial/index' });
  },
});
