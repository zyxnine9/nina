import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

/** 秒级时间戳 → 「2026-09-22」 */
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const p = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

Page({
  behaviors: [useToastBehavior],
  data: {
    loading: true,
    headline: null,
    generateAtText: '',
    newInsight: null,
    primaryTag: null,
    primaryTagStats: [],
    tags: [],
    moments: [],
  },
  onLoad() {
    this.fetchData();
  },
  async fetchData() {
    try {
      const [summaryRes, momentsRes] = await Promise.all([
        request('/discover/summary'),
        request('/moments', 'GET', { limit: 10 }),
      ]);
      const summary = summaryRes.data;
      const { items } = momentsRes.data;
      this.setData({
        loading: false,
        headline: summary.headline,
        generateAtText: formatDate(summary.headline && summary.headline.generateAt),
        newInsight: summary.newInsight || null,
        primaryTag: summary.primaryTag || null,
        primaryTagStats: summary.primaryTag
          ? [{ label: '条阅读证据', value: summary.primaryTag.evidenceCount }]
          : [],
        tags: summary.tags || [],
        moments: items || [],
      });
    } catch (err) {
      this.setData({ loading: false });
      this.onShowToast('#t-toast', 'NINA 走神了，稍后再试试');
    }
  },
  onTagTap(e) {
    // 标签详情子页后续迭代，先 toast 预留
    this.onShowToast('#t-toast', '标签详情即将上线');
  },
  onNewInsightTap() {
    this.onShowToast('#t-toast', '洞察详情即将上线');
  },
});
