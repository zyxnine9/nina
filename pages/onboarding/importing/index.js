import config from '~/config';
import { callAction } from '~/api/request';
import { driveImport } from '~/api/longTask';

// 键名与后端 JOB_STAGE 对齐（cloudfunctions/_shared/lib/importer.js）
const STAGES = [
  { key: 'validating', title: '校验 KEY' },
  { key: 'fetching_shelf', title: '读取书架' },
  { key: 'fetching_books', title: '读取划线与笔记' },
  { key: 'finalizing', title: '汇总整理' },
];

const STAGE_ORDER = STAGES.map((s) => s.key);

function buildStages(stage) {
  const idx = STAGE_ORDER.indexOf(stage);
  return STAGES.map((s, i) => ({
    ...s,
    state: stage === 'done' || i < idx ? 'done' : i === idx ? 'current' : 'pending',
  }));
}

Page({
  data: {
    stages: STAGES.map((s) => ({ ...s, state: 'pending' })),
    progress: 0,
    currentTask: '',
    failed: false,
    errorMsg: '',
    keyIssue: false,
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
    this.driver = driveImport({
      onProgress: (status) => this.renderStatus(status || {}),
      onFinish: (status) => this.renderStatus(status || {}),
    });
    this.driver.promise
      .then(() => this.onImportDone())
      .catch((err) => {
        const code = err && err.code;
        const msg = (err && (err.message || err.error)) || '导入失败，请重试';
        this.setData({
          failed: true,
          errorMsg: msg,
          // KEY 失效/无效时重试无意义，引导回重新填写
          keyIssue: code === 42200 || code === 50100 || /KEY/.test(msg),
        });
      });
  },

  renderStatus(status) {
    this.setData({
      stages: buildStages(status.stage || ''),
      progress: status.progress || 0,
      currentTask: status.currentTask || '',
    });
  },

  onImportDone() {
    if (config.isMock) {
      wx.redirectTo({ url: '/pages/onboarding/analyzing/index?mock=1' });
      return;
    }
    callAction('analysis_run', {})
      .then(() => wx.redirectTo({ url: '/pages/onboarding/analyzing/index' }))
      .catch((err) => {
        const msg = (err && err.data && err.data.message) || '分析启动失败';
        this.setData({ failed: true, errorMsg: msg });
      });
  },

  onRetry() {
    this.setData({ failed: false, errorMsg: '', keyIssue: false });
    this.startDriver();
  },

  onBackKeyInput() {
    if (this.driver) this.driver.stop();
    wx.redirectTo({ url: '/pages/onboarding/key-input/index' });
  },

  // ---------- mock 模拟（无云函数时的 UI 演示） ----------

  runMock() {
    const script = [
      { stage: 'validating', progress: 5, currentTask: '正在校验 KEY…' },
      { stage: 'shelf', progress: 10, currentTask: '正在读取书架…' },
      { stage: 'books', progress: 40, currentTask: '正在读取划线与笔记…' },
      { stage: 'books', progress: 80, currentTask: '正在整理笔记…' },
      { stage: 'finalizing', progress: 95, currentTask: '正在汇总…' },
      { stage: 'done', progress: 100, currentTask: '导入完成' },
    ];
    let i = 0;
    const timer = setInterval(() => {
      this.renderStatus(script[i]);
      i += 1;
      if (i >= script.length) {
        clearInterval(timer);
        wx.redirectTo({ url: '/pages/onboarding/analyzing/index?mock=1' });
      }
    }, 1200);
    this.driver = { stop: () => clearInterval(timer) };
  },
});
