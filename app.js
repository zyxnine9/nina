// app.js
import config from './config';
import Mock from './mock/index';
import createBus from './utils/eventBus';
import { connectSocket, fetchUnreadNum } from './mock/chat';
import request, { callAction } from './api/request';

if (config.isMock) {
  Mock();
}

App({
  onLaunch() {
    // 云开发初始化（mock 模式下不初始化，调试页 api/request.js 内有懒初始化兜底）
    if (!config.isMock && config.useCallFunction && wx.cloud) {
      wx.cloud.init({ env: config.envId, traceUser: true });
    }
    this.checkOnboarding();

    const updateManager = wx.getUpdateManager();

    updateManager.onCheckForUpdate((res) => {
      // console.log(res.hasUpdate)
    });

    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已经准备好，是否重启应用？',
        success(res) {
          if (res.confirm) {
            updateManager.applyUpdate();
          }
        },
      });
    });

    this.getUnreadNum();
    this.connect();
  },
  globalData: {
    userInfo: null,
    unreadNum: 0, // 未读消息数量
    socket: null, // SocketTask 对象
  },

  /** 全局事件总线 */
  eventBus: createBus(),

  /** 新用户未提供 KEY 且未跳过引导 → 进入引导流程（mock/云函数双模式） */
  checkOnboarding() {
    const go = (profile) => {
      if (profile && !profile.hasKey && !wx.getStorageSync('nina_onboard_skipped')) {
        wx.reLaunch({ url: '/pages/onboarding/welcome/index' });
      }
    };
    if (config.isMock) {
      // mock：/user/profile 由 mock/onboarding 提供（hasKey:false）
      request('/user/profile')
        .then((res) => go(res.data))
        .catch(() => {});
    } else if (config.useCallFunction) {
      callAction('user_profile')
        .then((res) => go(res.data && res.data.data))
        .catch(() => {
          // 查询失败不阻塞启动，避免网络抖动把老用户锁进引导页
        });
    }
  },

  /** 初始化WebSocket */
  connect() {
    const socket = connectSocket();
    socket.onMessage((data) => {
      data = JSON.parse(data);
      if (data.type === 'message' && !data.data.message.read) this.setUnreadNum(this.globalData.unreadNum + 1);
    });
    this.globalData.socket = socket;
  },

  /** 获取未读消息数量 */
  getUnreadNum() {
    fetchUnreadNum().then(({ data }) => {
      this.globalData.unreadNum = data;
      this.eventBus.emit('unread-num-change', data);
    });
  },

  /** 设置未读消息数量 */
  setUnreadNum(unreadNum) {
    this.globalData.unreadNum = unreadNum;
    this.eventBus.emit('unread-num-change', unreadNum);
  },
});
