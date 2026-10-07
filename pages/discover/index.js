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
    selectedTags: {},
    personas: [],
    bubbles: [],
    interests: [],
  },
  onLoad() {
    this.computeNavMetrics();
    this.fetchData();
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
      const [summaryRes, knowledgeRes, interestRes] = await Promise.all([
        request('/discover/summary'),
        request('/explore/knowledge'),
        request('/explore/interest'),
      ]);
      const summary = summaryRes.data;
      const knowledge = knowledgeRes.data;
      const interest = interestRes.data;

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

      const interests = (interest.items || []).map((it) => ({ id: it.id, name: it.name }));

      this.setData({ loading: false, personas, bubbles, interests });
    } catch (err) {
      this.setData({ loading: false });
      this.onShowToast('#t-toast', 'NINA 走神了，稍后再试试');
    }
  },
  // ---------- 画像卡 ----------
  onFullAnalysisTap() {
    wx.switchTab({ url: '/pages/explore/index' });
  },
  onPersonaTap(e) {
    const { tagId, name } = e.currentTarget.dataset;
    this.setData({ activePersona: tagId });
    this.onShowToast('#t-toast', `你的阅读人格：${name}`);
  },
  onBubbleTap(e) {
    const { name, percent } = e.currentTarget.dataset;
    this.onShowToast('#t-toast', `${name} · 阅读占比 ${percent}%`);
  },
  onCoreTap() {
    const paused = !this.data.paused;
    this.setData({ paused });
    this.onShowToast('#t-toast', paused ? '已减缓光影流动' : '光影继续流动');
  },
  onInterestTap(e) {
    const { id, name } = e.currentTarget.dataset;
    const selected = !this.data.selectedTags[id];
    this.setData({ [`selectedTags.${id}`]: selected });
    this.onShowToast('#t-toast', selected ? `已关注「${name}」` : `已取消关注「${name}」`);
  },
  onMoreInterestTap() {
    this.onShowToast('#t-toast', '更多推荐即将上线');
  },
});
