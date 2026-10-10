import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

const POINT_ICONS = ['↗', '♡', '♧'];
const FEEDBACKS = [
  { type: 'like', label: '很像我的' },
  { type: 'somewhat', label: '有一点像' },
  { type: 'dislike', label: '不太像我' },
];
const FEEDBACK_TYPES = FEEDBACKS.map((f) => f.type);
const TONES = ['blue', 'green', 'pink'];

function safeDecode(str, fallback) {
  if (!str) return fallback;
  try {
    return decodeURIComponent(str);
  } catch (err) {
    return str;
  }
}

Page({
  behaviors: [useToastBehavior],
  data: {
    loading: true,
    tagId: '',
    tone: 'blue',
    icon: '↗',
    name: '阅读人格',
    headline: '',
    points: [],
    quotes: [],
    trendNote: '',
    feedbacks: FEEDBACKS,
    feedback: null,
  },
  onLoad(query) {
    const tagId = (query && query.tagId) || '';
    if (!tagId) {
      wx.showToast({ title: '缺少标签参数', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    this.setData({
      tagId,
      tone: TONES.includes(query.tone) ? query.tone : 'blue',
      icon: safeDecode(query.icon, '↗'),
      name: safeDecode(query.name, '阅读人格'),
    });
    this.fetchData();
  },
  async fetchData() {
    const { tagId } = this.data;
    try {
      const res = await request(`/tags/${tagId}`);
      const detail = res.data || {};

      // 判断卡：截 3 条配 icon
      const points = (detail.points || []).slice(0, 3).map((p, i) => ({
        ...p,
        icon: POINT_ICONS[i % POINT_ICONS.length],
      }));

      // 引用卡：highlight 优先，须有书名，截 2 条
      const withBook = (detail.moments || []).filter((m) => m && (m.text || m.comment) && m.book && m.book.title);
      const quotes = [...withBook.filter((m) => m.type === 'highlight'), ...withBook.filter((m) => m.type !== 'highlight')]
        .slice(0, 2)
        .map((m) => ({
          text: m.text || m.comment,
          bookTitle: m.book.title,
          cover: m.book.cover || '',
          coverText: m.book.title.slice(0, 1),
        }));

      const byYear = (detail.trend && detail.trend.byYear) || [];
      const feedback = FEEDBACK_TYPES.includes(detail.feedback) ? detail.feedback : null;

      this.setData({
        loading: false,
        headline: detail.headline || '',
        points,
        quotes,
        trendNote: byYear.length > 1 ? '这一倾向近两年持续增强' : '',
        feedback,
      });
    } catch (err) {
      this.setData({ loading: false });
      this.onShowToast('#t-toast', 'NINA 走神了，稍后再试试');
    }
  },
  async onFeedbackTap(e) {
    const type = e.currentTarget.dataset.type;
    const { tagId, feedback } = this.data;
    if (!tagId || type === feedback) return;
    const prev = feedback;
    this.setData({ feedback: type }); // 乐观更新
    try {
      await request(`/tags/${tagId}/feedback`, 'post', { type });
    } catch (err) {
      this.setData({ feedback: prev });
      this.onShowToast('#t-toast', '没保存上，稍后再试试');
    }
  },
});
