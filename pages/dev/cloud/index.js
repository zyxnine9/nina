import { callAction } from '~/api/request';
import { driveImport, driveAnalysis } from '~/api/longTask';

const ACTIONS = [
  'user_profile',
  'auth_login',
  'import_key',
  'import_status',
  'import_sync',
  'moments_list',
  'moments_detail',
  'books_list',
  'categories',
  'topics_list',
  'topics_detail',
  'analysis_run',
  'analysis_status',
  'discover_summary',
  'tags_list',
  'tags_detail',
  'explore_overview',
  'explore_knowledge',
  'explore_interest',
  'explore_thinking',
  'explore_long_term',
  'explore_persona',
  'explore_unknown',
  'explore_map',
  'search',
  'share_cards',
];

Page({
  data: {
    actions: ACTIONS,
    current: '',
    wrKey: '',
    query: '',
    output: '点击按钮调用 action，回包 JSON 显示在这里',
    progressText: '',
  },

  driver: null,

  onKeyInput(e) {
    this.setData({ wrKey: e.detail.value });
  },
  onQueryInput(e) {
    this.setData({ query: e.detail.value });
  },

  print(label, res) {
    let text;
    try {
      text = JSON.stringify(res, null, 2);
    } catch (e) {
      text = String(res);
    }
    this.setData({ output: `[${label}] ${new Date().toLocaleTimeString()}\n${text}` });
  },

  async onRunAction(e) {
    const action = e.currentTarget.dataset.action;
    this.setData({ current: action });
    const params = {};
    if (action === 'import_key') {
      if (!/^wrk-/.test(this.data.wrKey)) {
        this.print(action, { code: 42200, message: '请先在上方输入 wrk- 开头的 KEY' });
        return;
      }
      params.key = this.data.wrKey;
    }
    if (action === 'search') params.q = this.data.query || '自由';
    if (action === 'topics_detail') params.topicId = this.data.query;
    if (action === 'tags_detail' || action === 'tags_feedback') params.tagId = this.data.query;
    try {
      const res = await callAction(action, params);
      this.print(action, res);
    } catch (err) {
      this.print(action, err);
    }
  },

  onDriveImport() {
    this.startDriver('import', () =>
      driveImport({
        onProgress: (status) => {
          if (status) {
            this.setData({
              progressText: `import: ${status.stage} ${status.progress}% ${status.currentTask || ''}`,
            });
          }
        },
      })
    );
  },

  onDriveAnalysis() {
    this.startDriver('analysis', () =>
      driveAnalysis({
        onProgress: (status) => {
          if (status) {
            this.setData({ progressText: `analysis: ${status.status} ${status.progress}%` });
          }
        },
      })
    );
  },

  startDriver(name, create) {
    this.onStop();
    this.setData({ progressText: `${name}: started...` });
    this.driver = create();
    this.driver.promise
      .then((status) => this.print(`${name}_done`, status))
      .catch((status) => this.print(`${name}_failed`, status));
  },

  onStop() {
    if (this.driver) {
      this.driver.stop();
      this.driver = null;
      this.setData({ progressText: '' });
    }
  },

  onUnload() {
    this.onStop();
  },
});
