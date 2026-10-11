import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

// 人格装饰（icon 用参考实现的线形符号；tone 对应三色样式）
const PERSONA_STYLES = [
  { icon: '↗', tone: 'blue' },
  { icon: '♡', tone: 'green' },
  { icon: '♧', tone: 'pink' },
];

// 气泡变体：与 mock items 数据顺序（人文社科/科技/心理学/经济管理/历史/文学艺术/其他）一一对应
const BUBBLE_VARIANTS = ['humanities', 'tech', 'psych', 'economy', 'history', 'arts', 'other'];

Page({
  behaviors: [useToastBehavior],
  data: {
    loading: true,
    statusBarHeight: 20,
    paused: false,
    activePersona: '',
    personas: [],
    bubbles: [],
  },
  onLoad() {
    this.computeNavMetrics();
    this.fetchData();
  },
  onShow() {
    if (this.getTabBar) {
      const tb = this.getTabBar();
      tb && tb.syncValue && tb.syncValue();
    }
  },
  computeNavMetrics() {
    try {
      const win = wx.getWindowInfo();
      this.setData({ statusBarHeight: (win && win.statusBarHeight) || 20 });
    } catch (err) {
      this.setData({ statusBarHeight: 20 });
    }
  },
  async fetchData() {
    try {
      const [summaryRes, knowledgeRes] = await Promise.all([
        request('/discover/summary'),
        request('/explore/knowledge'),
      ]);
      const summary = summaryRes.data;
      const knowledge = knowledgeRes.data;

      const personas = (summary.tags || []).slice(0, 3).map((tag, i) => ({
        ...tag,
        icon: PERSONA_STYLES[i].icon,
        tone: PERSONA_STYLES[i].tone,
      }));
      if (personas.length) this.setData({ activePersona: personas[0].tagId });

      const items = (knowledge.items || []).slice(0, 7); // 气泡轨道按 7 个设计，取 Top7 避免小占比噪声
      const total = items.reduce((sum, it) => sum + (it.readingTime || 0), 0) || 1;
      const bubbles = items.map((it, i) => ({
        id: it.id,
        name: it.name,
        percent: Math.round(((it.readingTime || 0) / total) * 100),
        variant: BUBBLE_VARIANTS[i % BUBBLE_VARIANTS.length],
      }));

      this.setData({ loading: false, personas, bubbles });
    } catch (err) {
      this.setData({ loading: false });
      this.onShowToast('#t-toast', 'NINA 走神了，稍后再试试');
    }
  },
  // ---------- 画像卡 ----------
  onPersonaTap(e) {
    const { tagId, name, tone, icon } = e.currentTarget.dataset;
    this.setData({ activePersona: tagId });
    wx.navigateTo({
      url: `/pages/persona/index?tagId=${tagId}&tone=${tone || 'blue'}&icon=${encodeURIComponent(icon || '')}&name=${encodeURIComponent(name || '')}`,
    });
  },
  onBubbleTap(e) {
    const { id, name, percent, variant } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/knowledge/index?id=${id}&variant=${variant || 'humanities'}&percent=${percent || 0}&name=${encodeURIComponent(name || '')}`,
    });
  },
  onCoreTap() {
    const paused = !this.data.paused;
    this.setData({ paused });
    this.onShowToast('#t-toast', paused ? '已减缓光影流动' : '光影继续流动');
  },
});
