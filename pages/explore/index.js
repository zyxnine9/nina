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

// 入口卡静态规格：序号 + 引导语 + 摘要缺省时的兜底文案（对齐 v2 原型首页）
const DIMENSION_SPECS = {
  thinking: { index: '01', label: '你如何回应观点', desc: '从原文与你的回应中，看见反复出现的思维动作。' },
  persona: { index: '02', label: '你带着怎样的气质阅读', desc: '一个精神原型，加上一天之中的真实阅读节律。' },
  unknown: { index: '03', title: '未读之境', label: '去往尚未抵达的地方', desc: '三个还没读过，却可能与你悄悄相连的新方向。' },
};
const DIMENSION_ORDER = ['thinking', 'persona', 'unknown'];

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
      const dimensions = (res.data.dimensions || [])
        .filter((d) => !HIDDEN_DIMENSIONS.includes(d.key) && DIMENSION_SPECS[d.key])
        .map((d) => {
          const spec = DIMENSION_SPECS[d.key];
          return {
            ...d,
            title: spec.title || d.title,
            index: spec.index,
            label: spec.label,
            desc: d.oneLine || spec.desc,
          };
        })
        .sort((a, b) => DIMENSION_ORDER.indexOf(a.key) - DIMENSION_ORDER.indexOf(b.key));
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
