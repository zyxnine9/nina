import config from '~/config';
import { callAction } from '~/api/request';
import { driveAnalysis } from '~/api/longTask';

Page({
  data: {
    stages: [],
    progress: 0,
    failed: false,
  },

  driver: null,

  onLoad(options) {
    if (options.mock === '1') {
      this.runMock();
      return;
    }
    this.startDriver();
  },

  onUnload() {
    if (this.driver) this.driver.stop();
  },

  startDriver() {
    this.driver = driveAnalysis({
      onProgress: (status) => this.renderStatus(status || {}),
      onFinish: (status) => this.renderStatus(status || {}),
    });
    this.driver.promise
      .then(() => wx.reLaunch({ url: '/pages/discover/index' }))
      .catch((status) => {
        this.renderStatus(status || {});
        this.setData({ failed: true });
      });
  },

  renderStatus(status) {
    this.setData({
      stages: status.stages || [],
      progress: status.progress || 0,
    });
  },

  onRetry() {
    this.setData({ failed: false });
    callAction('analysis_run', {})
      .then(() => this.startDriver())
      .catch(() => {
        // 已在跑的 analysis 直接继续驱动即可
        this.startDriver();
      });
  },

  onBack() {
    if (this.driver) this.driver.stop();
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/discover/index' }) });
  },

  // ---------- mock 模拟（无云函数时的 UI 演示） ----------

  runMock() {
    const stages = [
      '阅读特征',
      '身份标签',
      '阅读瞬间',
      '兴趣结构',
      '知识结构',
      '思维方式',
      '长期关注',
      '阅读人格',
      '未知领域',
    ].map((title, i) => ({ key: `s${i}`, title, revealed: false }));
    this.setData({ stages });
    let i = 0;
    const timer = setInterval(() => {
      this.setData({ progress: Math.round(((i + 1) / stages.length) * 100) });
      if (i >= stages.length) {
        clearInterval(timer);
        wx.reLaunch({ url: '/pages/discover/index' });
        return;
      }
      this.setData({ [`stages[${i}].revealed`]: true });
      i += 1;
    }, 900);
    this.driver = { stop: () => clearInterval(timer) };
  },
});
