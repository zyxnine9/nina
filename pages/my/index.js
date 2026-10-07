import request, { callAction } from '~/api/request';
import config from '~/config';
import useToastBehavior from '~/behaviors/useToast';

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

Page({
  behaviors: [useToastBehavior],

  data: {
    profile: {
      loading: true,
      userId: '',
      nickname: '',
      avatar: '',
      hasKey: false,
      keyStatus: 'none',
      keyHint: '',
      keyUpdatedAt: 0,
      keyUpdatedAtText: '',
    },
  },

  onShow() {
    if (this.getTabBar) {
      const tb = this.getTabBar();
      tb && tb.syncValue && tb.syncValue();
    }
    this.fetchProfile();
  },

  async fetchProfile() {
    try {
      const res = await request('/user/profile');
      const p = res.data || {};
      this.setData({
        profile: {
          loading: false,
          userId: p.userId || '',
          nickname: p.nickname || 'NINA 用户',
          avatar: p.avatar || '',
          hasKey: Boolean(p.hasKey),
          keyStatus: p.keyStatus || 'none',
          keyHint: p.keyHint || '',
          keyUpdatedAt: p.keyUpdatedAt || 0,
          keyUpdatedAtText: this.formatTime(p.keyUpdatedAt),
        },
      });
    } catch (e) {
      this.setData({ 'profile.loading': false });
      this.onShowToast('#t-toast', '加载失败，请稍后重试');
    }
  },

  // 微信头像昵称填写能力：点头像拉起微信头像选择
  onChooseAvatar(e) {
    const avatarUrl = e.detail && e.detail.avatarUrl;
    if (!avatarUrl) return;
    this.setData({ 'profile.avatar': avatarUrl }); // 本地即时预览
    if (config.isMock) {
      this.onShowToast('#t-toast', '演示模式：头像仅本地生效');
      return;
    }
    if (!wx.cloud) {
      this.onShowToast('#t-toast', '基础库过低，无法上传头像');
      return;
    }
    wx.cloud.init({ env: config.envId, traceUser: true });
    const ext = ((/\.(\w+)$/.exec(avatarUrl) || [])[1] || 'png').toLowerCase();
    wx.cloud.uploadFile({
      cloudPath: `avatars/${this.data.profile.userId}/${Date.now()}.${ext}`,
      filePath: avatarUrl,
      success: (res) => this.persistProfile({ avatar: res.fileID }),
      fail: () => this.onShowToast('#t-toast', '头像上传失败，请重试'),
    });
  },

  // type=nickname 输入框：失焦保存昵称（键盘可快捷填入微信昵称）
  onNicknameBlur(e) {
    const nickname = ((e.detail && e.detail.value) || '').trim();
    if (!nickname || nickname === this.data.profile.nickname) return;
    if (config.isMock) {
      this.setData({ 'profile.nickname': nickname });
      this.onShowToast('#t-toast', '演示模式：昵称仅本地生效');
      return;
    }
    this.persistProfile({ nickname });
  },

  async persistProfile(patch) {
    try {
      await callAction('user_update_profile', patch);
      this.setData({ profile: { ...this.data.profile, ...patch } });
      this.onShowToast('#t-toast', '已保存');
    } catch (e) {
      this.onShowToast('#t-toast', (e && e.data && e.data.message) || '保存失败，请重试');
    }
  },

  // keyUpdatedAt 为秒级时间戳
  formatTime(sec) {
    if (!sec) return '';
    const d = new Date(sec * 1000);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  },

  onBindKey() {
    wx.navigateTo({ url: '/pages/onboarding/key-input/index' });
  },

  onReplaceKey() {
    wx.navigateTo({ url: '/pages/onboarding/key-input/index?replace=1' });
  },

  goSetting() {
    wx.navigateTo({ url: '/pages/setting/index' });
  },

  onMore() {
    this.onShowToast('#t-toast', '敬请期待');
  },
});
