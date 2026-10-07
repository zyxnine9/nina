import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

const SEGMENTS = [
  { key: 'moments', label: '瞬间' },
  { key: 'books', label: '书单' },
];

Page({
  behaviors: [useToastBehavior],
  data: {
    segments: SEGMENTS,
    segment: 'moments',
    categories: [], // [{ categoryId, name }]
    activeCategoryId: '', // 空 = 全部
    loading: true,
    moments: [],
    books: [],
  },
  onLoad() {
    this.init();
  },
  onShow() {
    if (this.getTabBar) {
      const tb = this.getTabBar();
      tb && tb.syncValue && tb.syncValue();
    }
  },
  async init() {
    try {
      const [catRes, momentsRes, booksRes] = await Promise.all([
        request('/categories'),
        request('/moments', 'GET', { limit: 20 }),
        request('/books', 'GET', { limit: 20 }),
      ]);
      this.setData({
        loading: false,
        categories: (catRes.data.items || []).map((c) => ({ categoryId: c.categoryId, name: c.name })),
        moments: momentsRes.data.items || [],
        books: booksRes.data.items || [],
      });
    } catch (err) {
      this.setData({ loading: false });
      this.onShowToast('#t-toast', 'NINA 走神了，稍后再试试');
    }
  },
  onSegmentChange(e) {
    const { key } = e.currentTarget.dataset;
    if (key === this.data.segment) return;
    this.setData({ segment: key });
  },
  onCategoryTap(e) {
    const { categoryId } = e.currentTarget.dataset;
    const activeCategoryId = categoryId === this.data.activeCategoryId ? '' : categoryId;
    this.setData({ activeCategoryId });
    this.fetchMoments(activeCategoryId);
  },
  async fetchMoments(categoryId) {
    try {
      const params = { limit: 20 };
      if (categoryId) params.categoryId = categoryId;
      const res = await request('/moments', 'GET', params);
      this.setData({ moments: res.data.items || [] });
    } catch (err) {
      this.onShowToast('#t-toast', 'NINA 走神了，稍后再试试');
    }
  },
  goSearch() {
    wx.navigateTo({ url: '/pages/search/index' });
  },
});
