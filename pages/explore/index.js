import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

Page({
  behaviors: [useToastBehavior],
  data: {
    loading: true,
    dimensions: [],
  },
  onLoad() {
    this.fetchData();
  },
  onShow() {
    if (this.getTabBar) {
      const tb = this.getTabBar();
      tb && tb.syncValue && tb.syncValue();
    }
  },
  async fetchData() {
    try {
      const res = await request('/explore/overview');
      this.setData({ loading: false, dimensions: res.data.dimensions || [] });
    } catch (err) {
      this.setData({ loading: false });
      this.onShowToast('#t-toast', 'NINA 走神了，稍后再试试');
    }
  },
  onDimensionTap(e) {
    // 六维详情页后续迭代，先 toast 预留
    const { title } = e.currentTarget.dataset;
    this.onShowToast('#t-toast', `「${title}」详情即将上线`);
  },
});
