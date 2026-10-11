import request, { callAction } from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

/** 秒 → 「X 小时 Y 分钟」/「N 分钟」 */
function formatHours(seconds) {
  if (!seconds || seconds <= 0) return '';
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
  }
  return `${Math.round(seconds / 60)} 分钟`;
}

/** 沉浸时长：≥60 分钟按小时，否则按分钟 */
function formatSession(seconds) {
  if (!seconds || seconds <= 0) return '';
  const min = Math.round(seconds / 60);
  if (min >= 60) return `${(min / 60).toFixed(1)} 小时`;
  return `${min} 分钟`;
}

Page({
  behaviors: [useToastBehavior],
  data: {
    loading: true,
    failed: false,
    basisText: '',
    summary: '',
    archetype: null,
    titleText: '', // 人物名（+来源）
    traits: [],
    rhythm: null, // 四格统计
    myFeedback: '', // like | somewhat | dislike
    submittingFeedback: false,
  },
  onLoad() {
    this.fetchData();
  },
  async fetchData() {
    this.setData({ loading: true, failed: false });
    try {
      const res = await request('/explore/persona');
      const d = res.data || {};
      const basis = d.basis || {};
      const parts = [];
      if (basis.readDays) parts.push(`${basis.readDays} 个阅读日`);
      if (basis.bookCount) parts.push(`读过的 ${basis.bookCount} 本书`);

      const a = d.archetype || null;
      const rhythm = d.rhythm || {};
      const stats = [];
      const peak = rhythm.peakHour || 0;
      stats.push({ label: '阅读高峰', value: `${String(peak).padStart(2, '0')}:00` });
      stats.push({ label: '夜间阅读', value: `${Math.round((rhythm.nightRatio || 0) * 100)}%` });
      const session = formatSession(rhythm.avgSessionSeconds);
      if (session) stats.push({ label: '平均单次沉浸', value: session });
      const total = formatHours(rhythm.totalReadTime);
      if (total) stats.push({ label: '累计阅读', value: total });
      if (rhythm.readDays) stats.push({ label: '活跃阅读天数', value: `${rhythm.readDays} 天` });

      this.setData({
        loading: false,
        basisText: parts.length ? `基于 ${parts.join(' 及 ')}` : '',
        summary: d.summary || '',
        archetype: a,
        titleText: a ? (a.sourceTitle ? `《${a.sourceTitle}》中的${a.name}` : a.name) : '',
        traits: a ? a.traits || [] : [],
        rhythm: stats,
        myFeedback: (d.myFeedback && d.myFeedback.type) || '',
      });
    } catch (err) {
      this.setData({ loading: false, failed: true });
    }
  },
  onRetry() {
    this.fetchData();
  },
  async onFeedbackTap(e) {
    const { type } = e.currentTarget.dataset;
    if (!type || this.data.submittingFeedback) return;
    this.setData({ submittingFeedback: true });
    try {
      await callAction('persona_feedback', { type });
      this.setData({ myFeedback: type });
      this.onShowToast('#t-toast', '收到，会融进下一次画像更新');
    } catch (err) {
      this.onShowToast('#t-toast', '反馈没送出去，稍后再试试');
    } finally {
      this.setData({ submittingFeedback: false });
    }
  },
});
