import request, { callAction } from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

const FEEDBACK_TYPES = ['interested', 'not_interested', 'already_read'];

// 亲缘徽章：连接很强=mint / 值得试试=blue / 意外的可能=gold（云端只回 affinityLabel）
function badgeOf(it) {
  const label = it.affinityLabel || '';
  if (label.indexOf('意外') >= 0) return { tagSpec: 'gold', tagIcon: 'tips', tagColor: '#90642e' };
  if (label.indexOf('值得') >= 0) return { tagSpec: 'blue', tagIcon: 'compass', tagColor: '#426a9d' };
  return { tagSpec: 'mint', tagIcon: 'link-1', tagColor: '#268579' };
}

/** entry → 「从这里开始」卡的 label + 问句/书名（q 从长句标题里截取核心） */
function entryOf(entry) {
  if (!entry) return null;
  const title = entry.title || '';
  const quoted = title.match(/《([^》]+)》/);
  if (entry.type === 'question') {
    const m = title.match(/「([^」]+)」/);
    return { label: '带着一个问题去读', q: m ? m[1] : title };
  }
  if (entry.type === 'book') return { label: '从一本书开始', q: quoted ? `《${quoted[1]}》` : title };
  const n = entry.payload && entry.payload.books && entry.payload.books.length;
  const tail = n ? `等 ${n} 本入门书` : '等几本入门书';
  return { label: '从几本入门书开始', q: quoted ? `《${quoted[1]}》${tail}` : title };
}

const PORTALS = ['/images/portal-mint.png', '/images/portal-blue.png', '/images/portal-gold.png'];

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
      const items = (d.items || []).map((it, i) => {
        const spec = (i % 3) + 1;
        return {
          ...it,
          intro: it.intro || '',
          reason: it.reason || '',
          connections: it.connections || [],
          entry: entryOf(it.entry),
          myFeedback: (it.myFeedback && it.myFeedback.type) || '',
          subtitle: (it.connections || []).map((c) => c.name).join(' × '),
          portal: PORTALS[spec - 1],
          ...badgeOf(it),
        };
      });
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
  onStartTap() {
    this.onShowToast('#t-toast', '阅读路径即将上线');
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
