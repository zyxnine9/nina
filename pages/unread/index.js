import request, { callAction } from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

const FEEDBACK_TYPES = ['interested', 'not_interested', 'already_read'];

/** 亲缘徽章：连接很强/值得试试=蓝系 / 意外的可能=金系（云端只回 affinityLabel） */
function badgeOf(it) {
  const label = it.affinityLabel || '';
  if (label.indexOf('意外') >= 0) return { badgeSpec: 'blind', badgeIcon: 'tips', badgeColor: '#a97f2e' };
  if (label.indexOf('值得') >= 0) return { badgeSpec: 'potential', badgeIcon: 'compass', badgeColor: '#3a6ea5' };
  return { badgeSpec: 'potential', badgeIcon: 'link-1', badgeColor: '#3a6ea5' };
}

Page({
  behaviors: [useToastBehavior],
  data: {
    loading: true,
    failed: false,
    forming: false,
    items: [],
    expandedId: '', // 手风琴：同一时刻只展开一张
    submittingFeedback: false,
  },
  onLoad() {
    this.fetchData();
  },
  async fetchData() {
    this.setData({ loading: true, failed: false });
    try {
      const res = await request('/explore/unknown');
      const d = res.data || {};
      const items = (d.items || []).map((it, i) => ({
        ...it,
        intro: it.intro || '',
        reason: it.reason || '',
        connections: it.connections || [],
        entry: it.entry || null,
        myFeedback: (it.myFeedback && it.myFeedback.type) || '',
        entryBooks: (it.entry && it.entry.payload && it.entry.payload.books) || [],
        subtitle: (it.connections || []).map((c) => c.name).join(' × '),
        spec: (i % 3) + 1, // 三扇"远方入口"错落配色
        ...badgeOf(it),
      }));
      this.setData({
        loading: false,
        forming: Boolean(d.forming),
        items,
        expandedId: items.length ? items[0].id : '',
      });
    } catch (err) {
      this.setData({ loading: false, failed: true });
    }
  },
  onRetry() {
    this.fetchData();
  },
  onCardTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!id || id === this.data.expandedId) return;
    this.setData({ expandedId: id });
  },
  // 「从这里开始」：书/书单后续接书单页，问题/路径先 toast 预留
  onStartTap(e) {
    const { type } = e.currentTarget.dataset;
    if (type === 'book' || type === 'book_list') {
      this.onShowToast('#t-toast', '书单页即将上线');
    } else {
      this.onShowToast('#t-toast', '阅读路径即将上线');
    }
  },
  async onFeedbackTap(e) {
    const { id, type } = e.currentTarget.dataset;
    if (!id || !FEEDBACK_TYPES.includes(type) || this.data.submittingFeedback) return;
    this.setData({ submittingFeedback: true });
    try {
      await callAction('unknown_feedback', { id, type });
      const items = this.data.items.map((it) => (it.id === id ? { ...it, myFeedback: type } : it));
      this.setData({ items });
      this.onShowToast('#t-toast', '收到，下一版推荐会记得它');
    } catch (err) {
      this.onShowToast('#t-toast', '反馈没送出去，稍后再试试');
    } finally {
      this.setData({ submittingFeedback: false });
    }
  },
  onConnectionTap() {
    this.onShowToast('#t-toast', '阅读瞬间详情即将上线');
  },
});
