import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

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
      this.setData({
        loading: false,
        forming: Boolean(d.forming),
        basisText: parts.length ? `基于 ${parts.join(' · ')}` : '',
        summary: d.summary || '',
        items: (d.items || []).map((it) => ({
          ...it,
          evidenceGroups: (it.evidenceGroups || []).map((g) => ({ ...g, sourceText: g.sourceText || '', userResponse: g.userResponse || '' })),
        })),
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
    this.onShowToast('#t-toast', '阅读瞬间详情即将上线');
  },
  onMoreTap() {
    this.onShowToast('#t-toast', '更多证据即将上线');
  },
});
