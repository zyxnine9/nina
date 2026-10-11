import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

// 与发现页气泡 BUBBLE_VARIANTS 一致的 7 变体白名单
const VARIANTS = ['humanities', 'tech', 'psych', 'economy', 'history', 'arts', 'other'];

function safeDecode(str, fallback) {
  if (!str) return fallback;
  try {
    return decodeURIComponent(str);
  } catch (err) {
    return str;
  }
}

/** minutes → 「42 分钟」/「X.Y 小时」（0 时丢弃该段） */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '';
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)} 小时`;
  return `${minutes} 分钟`;
}

Page({
  behaviors: [useToastBehavior],
  data: {
    loading: true,
    id: '',
    variant: 'humanities',
    name: '知识主题',
    percent: 0,
    statsText: '',
    children: [],
  },
  onLoad(query) {
    const id = (query && query.id) || '';
    if (!id) {
      wx.showToast({ title: '缺少主题参数', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    this.setData({
      id,
      variant: VARIANTS.includes(query.variant) ? query.variant : 'humanities',
      name: safeDecode(query.name, '知识主题'),
      percent: parseInt(query.percent, 10) || 0,
    });
    this.fetchData();
  },
  async fetchData() {
    const { id, name, percent } = this.data;
    try {
      const res = await request(`/knowledge/${id}`);
      const detail = res.data || {};

      // 「42 分钟 · 8 本书 · 36 条阅读瞬间」
      const parts = [];
      const duration = formatDuration(detail.minutes);
      if (duration) parts.push(duration);
      if (detail.bookCount) parts.push(`${detail.bookCount} 本书`);
      if (detail.momentCount) parts.push(`${detail.momentCount} 条阅读瞬间`);

      const children = (detail.children || []).map((c, i) => ({
        ...c,
        spec: (i % 3) + 1, // 光谱/色条三色循环索引
        desc: c.desc || '',
        common: c.common || '',
        books: (c.books || []).map((b) => ({
          ...b,
          initial: (b.title || '').slice(0, 1) || '书', // 无封面首字占位
        })),
      }));

      this.setData({
        loading: false,
        name: detail.name || name,
        percent: typeof detail.percent === 'number' ? detail.percent : percent,
        statsText: parts.join(' · '),
        children,
      });
    } catch (err) {
      this.setData({ loading: false });
      this.onShowToast('#t-toast', 'NINA 走神了，稍后再试试');
    }
  },
  // 「查看全部 N 本」本期仅展示
  onAllBooksTap() {
    this.onShowToast('#t-toast', '书单页即将上线');
  },
});
