import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

// insight-strip 图标按块轮换（对齐原型 spark/link/compass）
const INSIGHT_ICONS = ['tips', 'link-1', 'compass'];

Page({
  behaviors: [useToastBehavior],
  data: {
    loading: true,
    failed: false,
    forming: false,
    basisText: '',
    summary: '',
    items: [],
  },
  onLoad() {
    this.fetchData();
  },
  async fetchData() {
    this.setData({ loading: true, failed: false });
    try {
      const res = await request('/explore/thinking');
      const d = res.data || {};
      const basis = d.basis || {};
      const parts = [];
      if (basis.commentCount) parts.push(`${basis.commentCount} 条评论与划线`);
      if (basis.bookCount) parts.push(`${basis.bookCount} 本书`);

      const items = (d.items || []).map((it, i) => {
        const groups = (it.evidenceGroups || []).map((g) => ({
          ...g,
          sourceText: g.sourceText || '',
          userResponse: g.userResponse || '',
        }));
        return {
          ...it,
          lead: groups[0] || null, // 首组 = 对话双卡
          more: groups.slice(1), // 其余 = 「查看更多证据」展开区
          expanded: false,
          insightIcon: INSIGHT_ICONS[i % INSIGHT_ICONS.length],
        };
      });

      this.setData({
        loading: false,
        forming: Boolean(d.forming),
        basisText: parts.length ? `基于 ${parts.join(' · ')}` : '',
        summary: d.summary || '',
        items,
      });
    } catch (err) {
      this.setData({ loading: false, failed: true });
    }
  },
  onRetry() {
    this.fetchData();
  },
  // 证据卡点击：阅读瞬间详情页后续迭代
  onEvidenceTap() {
    this.onShowToast('#t-toast', '已定位到这条阅读瞬间');
  },
  onExpandTap(e) {
    const { id } = e.currentTarget.dataset;
    const items = this.data.items.map((it) => (it.id === id ? { ...it, expanded: !it.expanded } : it));
    this.setData({ items });
  },
  onMoreTap() {
    this.onShowToast('#t-toast', '更多思维证据即将上线');
  },
});
