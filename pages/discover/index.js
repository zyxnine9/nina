import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

const PERSONA_STYLES = [
  { icon: '🧠', tone: 'blue' },
  { icon: '🧭', tone: 'green' },
  { icon: '🌷', tone: 'pink' },
];

// 气泡布局：340×310 设计稿基准坐标（fx/fy 为相对位置），按 scale = W/340 适配机型
const CENTER_BUBBLE = { fx: 0.5, fy: 0.53, r: 46 };
const FIELD_BUBBLES = [
  { fx: 0.52, fy: 0.16 },
  { fx: 0.87, fy: 0.3 },
  { fx: 0.85, fy: 0.68 },
  { fx: 0.5, fy: 0.88 },
  { fx: 0.15, fy: 0.78 },
  { fx: 0.11, fy: 0.47 },
  { fx: 0.22, fy: 0.17 },
];
const BUBBLE_COLORS = ['#dfe8fa', '#d5e8f7', '#fadde7', '#f7e3cf', '#d9f0e2', '#e6e2f5', '#e4e9ef'];
const TEXT_PRIMARY = '#1a1d24';
const TEXT_SECONDARY = '#6b7280';

Page({
  behaviors: [useToastBehavior],
  data: {
    loading: true,
    statusBarHeight: 20,
    searchRight: 100,
    personas: [],
    bubbles: [],
    interests: [],
  },
  onLoad() {
    this.computeNavMetrics();
    this.fetchData();
  },
  // 自定义导航栏度量：状态栏高度 + 胶囊右侧避让距离
  computeNavMetrics() {
    try {
      const win = wx.getWindowInfo();
      const menu = wx.getMenuButtonBoundingClientRect();
      const statusBarHeight = (win && win.statusBarHeight) || 20;
      const searchRight = menu && menu.left ? (win.windowWidth - menu.left) + 8 : 100;
      this.setData({ statusBarHeight, searchRight });
    } catch (err) {
      this.setData({ statusBarHeight: 20, searchRight: 100 });
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

      const items = knowledge.items || [];
      const total = items.reduce((sum, it) => sum + (it.readingTime || 0), 0) || 1;
      const bubbles = items.map((it) => ({
        id: it.id,
        name: it.name,
        percent: Math.round(((it.readingTime || 0) / total) * 100),
      }));

      const interests = (interest.items || []).map((it) => ({ id: it.id, name: it.name }));

      this.setData({ loading: false, personas, bubbles, interests }, () => {
        this.initBubbleCanvas();
      });
    } catch (err) {
      this.setData({ loading: false });
      this.onShowToast('#t-toast', 'NINA 走神了，稍后再试试');
    }
  },
  // ---------- 气泡图 ----------
  initBubbleCanvas() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#bubbleCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const { node, width, height } = res[0];
      const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2;
      node.width = width * dpr;
      node.height = height * dpr;
      const ctx = node.getContext('2d');
      ctx.scale(dpr, dpr);
      this.drawBubbles(ctx, width, height);
    });
  },
  drawBubbles(ctx, width, height) {
    const scale = width / 340;
    const pMax = Math.max(...this.data.bubbles.map((b) => b.percent), 1);

    // 中心泡
    this.drawCircle(ctx, CENTER_BUBBLE.fx * width, CENTER_BUBBLE.fy * height, CENTER_BUBBLE.r * scale, '#ffffff', 'rgba(72, 144, 240, 0.25)');
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = `600 ${13 * scale}px -apple-system, 'PingFang SC', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('你的知识', CENTER_BUBBLE.fx * width, CENTER_BUBBLE.fy * height - 8 * scale);
    ctx.fillText('结构', CENTER_BUBBLE.fx * width, CENTER_BUBBLE.fy * height + 10 * scale);

    // 领域泡
    this.data.bubbles.forEach((bubble, i) => {
      const pos = FIELD_BUBBLES[i % FIELD_BUBBLES.length];
      const x = pos.fx * width;
      const y = pos.fy * height;
      const r = (18 + (bubble.percent / pMax) * 26) * scale;
      this.drawCircle(ctx, x, y, r, BUBBLE_COLORS[i % BUBBLE_COLORS.length], null);
      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = `${12 * scale}px -apple-system, 'PingFang SC', sans-serif`;
      ctx.fillText(bubble.name, x, y - 6 * scale);
      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = `${10 * scale}px -apple-system, 'PingFang SC', sans-serif`;
      ctx.fillText(`${bubble.percent}%`, x, y + 9 * scale);
    });
  },
  drawCircle(ctx, x, y, r, fill, stroke) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  },
  // ---------- 交互 ----------
  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/index' });
  },
  onFullAnalysisTap() {
    wx.switchTab({ url: '/pages/explore/index' });
  },
  onCanvasTap() {
    wx.switchTab({ url: '/pages/explore/index' });
  },
  onPersonaTap() {
    this.onShowToast('#t-toast', '人格详情即将上线');
  },
  onInterestTap() {
    this.onShowToast('#t-toast', '领域详情即将上线');
  },
  onMoreInterestTap() {
    this.onShowToast('#t-toast', '更多推荐即将上线');
  },
});
