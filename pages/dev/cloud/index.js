import { callAction } from '~/api/request';
import { driveImport, driveAnalysis } from '~/api/longTask';
import { callHttpFunction, streamSSE } from '~/api/sse';

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
    ssePrompt: '用一句话介绍你自己',
    sseOutput: '',
    sseRunning: false,
  },

  driver: null,
  sseStream: null,
  sseBuffer: '',
  sseFlushTimer: null,

  onKeyInput(e) {
    this.setData({ wrKey: e.detail.value });
  },
  onQueryInput(e) {
    this.setData({ query: e.detail.value });
  },
  onSsePromptInput(e) {
    this.setData({ ssePrompt: e.detail.value });
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

  // ---------- SSE 测试 ----------

  async onHealthz() {
    try {
      const res = await callHttpFunction({ path: '/healthz' });
      this.print('healthz', res);
    } catch (err) {
      this.print('healthz_error', err);
    }
  },

  onSseDemo() {
    this.startSse('demo', { path: '/sse/demo' });
  },

  onSseLlm() {
    const prompt = this.data.ssePrompt || '用一句话介绍你自己';
    this.startSse('llm', {
      path: '/llm/stream',
      method: 'POST',
      data: { prompt },
    });
  },

  startSse(label, options) {
    this.onStopSse();
    this.setData({ sseOutput: '', sseRunning: true });
    this.sseBuffer = '';
    this.print(`sse_${label}`, 'started...');
    this.sseStream = streamSSE({
      ...options,
      onEvent: (obj) => {
        if (typeof obj.delta === 'string') {
          this.sseBuffer += obj.delta;
        } else if (typeof obj.text === 'string') {
          this.sseBuffer += `${obj.seq}: ${obj.text}\n`;
        }
        this.scheduleSseFlush();
      },
      onDone: () => {
        this.flushSse(true);
        this.setData({ sseRunning: false });
        this.print(`sse_${label}_done`, '[DONE]');
        this.sseStream = null;
      },
      onError: (err) => {
        this.flushSse(true);
        this.setData({ sseRunning: false });
        this.print(`sse_${label}_error`, err);
        this.sseStream = null;
      },
    });
  },

  // 节流刷新：每 100ms 把攒的 buffer 刷到页面，避免逐字 setData 卡顿
  scheduleSseFlush() {
    if (this.sseFlushTimer) return;
    this.sseFlushTimer = setTimeout(() => {
      this.sseFlushTimer = null;
      this.flushSse();
    }, 100);
  },

  flushSse(final) {
    if (!this.sseBuffer) return;
    if (final && this.sseFlushTimer) {
      clearTimeout(this.sseFlushTimer);
      this.sseFlushTimer = null;
    }
    this.setData({ sseOutput: this.data.sseOutput + this.sseBuffer });
    this.sseBuffer = '';
  },

  onStopSse() {
    if (this.sseStream) {
      this.sseStream.cancel();
      this.sseStream = null;
    }
    if (this.sseFlushTimer) {
      clearTimeout(this.sseFlushTimer);
      this.sseFlushTimer = null;
    }
    if (this.sseBuffer) {
      this.flushSse(true);
    }
    this.setData({ sseRunning: false });
  },

  onUnload() {
    this.onStop();
    this.onStopSse();
  },
});
