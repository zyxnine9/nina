import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

// 本期隐藏的维度（知识结构/兴趣结构/长期关注）
const HIDDEN_DIMENSIONS = ['knowledge', 'interest', 'long_term'];

// 维度 → 全屏详情页路由
const DIMENSION_ROUTES = {
  thinking: '/pages/thinking/index',
  persona: '/pages/archetype/index',
  unknown: '/pages/unread/index',
};

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
      const dimensions = (res.data.dimensions || []).filter((d) => !HIDDEN_DIMENSIONS.includes(d.key));
      this.setData({ loading: false, dimensions });
    } catch (err) {
      this.setData({ loading: false });
      this.onShowToast('#t-toast', 'NINA 走神了，稍后再试试');
    }
  },
  onDimensionTap(e) {
    const { key, title } = e.currentTarget.dataset;
    const route = DIMENSION_ROUTES[key];
    if (route) {
      wx.navigateTo({ url: route });
    } else {
      this.onShowToast('#t-toast', `「${title}」详情即将上线`);
    }
  },
});
