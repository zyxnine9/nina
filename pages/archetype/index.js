import request, { callAction } from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

/** 秒 → 「X 小时 Y 分钟」/「N 分钟」（备用） */
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

const TRAIT_ICONS = [
  { icon: 'compass', iconColor: '#7c6cf0' },
  { icon: 'moon', iconColor: '#c08a2d' },
  { icon: 'bookmark', iconColor: '#4a7fb5' },
];

const RHYTHM_SPECS = [
  { icon: 'sunny', iconColor: '#7c6cf0', note: '这段时间你最容易进入阅读状态' },
  { icon: 'moon', iconColor: '#4a7fb5', note: '在夜深人静时，你会与书相伴' },
  { icon: 'time', iconColor: '#c08a2d', note: '每次阅读都能保持较长的专注时长' },
  { icon: 'calendar', iconColor: '#3d9a76', note: '在过去的日子里，阅读已成为你生活的一部分' },
];

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
      const peak = rhythm.peakHour || 0;
      const session = formatSession(rhythm.avgSessionSeconds);
      const rhythmItems = [
        { label: '阅读高峰', value: `${String(peak).padStart(2, '0')}:00` },
        { label: '夜间阅读', value: `${Math.round((rhythm.nightRatio || 0) * 100)}%` },
        { label: '平均单次沉浸', value: session || '—' },
        { label: '活跃阅读天数', value: rhythm.readDays ? `${rhythm.readDays} 天` : '—' },
      ].map((it, i) => ({ ...it, ...RHYTHM_SPECS[i] }));

      this.setData({
        loading: false,
        basisText: parts.length ? `基于 ${parts.join(' 及 ')}` : '',
        summary: d.summary || '',
        archetype: a,
        titleText: a ? (a.sourceTitle ? `《${a.sourceTitle}》中的${a.name}` : a.name) : '',
        traits: a ? (a.traits || []).map((t, i) => ({ ...t, ...TRAIT_ICONS[i % TRAIT_ICONS.length] })) : [],
        rhythm: rhythmItems,
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
