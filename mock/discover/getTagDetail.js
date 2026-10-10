// NINA_API.md 5.4/5.5 GET /tags/{tagId} + POST /tags/{tagId}/feedback
// 动态路径按具体 id 注册（WxMock 精确 URL 匹配）；feedbackState 会话内存活，详情回显选中态

const feedbackState = { tag_01: null, tag_02: null, tag_03: null };

const DETAILS = {
  tag_01: {
    name: '理性思考者',
    summary: '从你近一年的阅读来看，你似乎不轻易接受一个结论，总要先拆开它、验证它，再决定是否放进自己的认知体系。',
    headline: '你用阅读整理不确定，而不是逃离它。',
    points: [
      {
        title: '偏爱长期视角',
        text: '你划线的段落多在讨论十年尺度的问题——复利、习惯、知识的复购。比起当下的答案，你更关心什么在更长的时间里依然成立。',
      },
      {
        title: '先质疑再接受',
        text: '在《反脆弱》和《穷查理宝典》里，你反复停在作者「推翻常识」的段落，而不是结论本身。你收集的是思考的方法，不是思考的结果。',
      },
    ],
    reasoning: '语料中关于「不确定性」「长期主义」「反直觉」的划线占比明显偏高，且评论多为追问而非附和。',
    stats: { bookCount: 12, momentCount: 23, highlightCount: 17, reviewCount: 6, firstSeenAt: 1704038400, longTerm: true },
    books: [
      { bookId: 'bk_1001', title: '反脆弱', author: '纳西姆·塔勒布', cover: '', momentCount: 9 },
      { bookId: 'bk_1002', title: '穷查理宝典', author: '查理·芒格', cover: '', momentCount: 7 },
    ],
    moments: [
      {
        _id: 'm_01', type: 'highlight', categoryId: 'cat_philosophy', createdAt: 1735689600,
        text: '风会熄灭蜡烛，却能使火越烧越旺。你要利用 randomness，而不是躲避它。',
        book: { bookId: 'bk_1001', title: '反脆弱', cover: '' },
      },
      {
        _id: 'm_02', type: 'highlight', categoryId: 'cat_philosophy', createdAt: 1728432000,
        text: '如果你不能比你的对手更清楚地反驳自己的观点，你就不配拥有这个观点。',
        book: { bookId: 'bk_1002', title: '穷查理宝典', cover: '' },
      },
    ],
    trend: { byYear: [{ year: 2024, count: 8 }, { year: 2025, count: 15 }] },
    relatedTopics: [{ topicId: 'topic_01', name: '不确定性与决策' }],
  },

  tag_02: {
    name: '探索者',
    summary: '你的书单跨越了几个明显的边界：题材、体裁、领域。你似乎更在意「下一本读什么」，而不是「这一本读完了吗」。',
    headline: '你把书架当成地图，每一次翻页都在换一片大陆。',
    points: [
      {
        title: '跨域的胃口',
        text: '科幻、历史、心理学的划线在你的语料里几乎平分秋色。你不是在收集某一类知识，更像是在试探不同世界观的边界。',
      },
    ],
    reasoning: '你的阅读记录覆盖 12 个分类，且没有单一分类占比超过 20%，跨类切换频率高于一般读者。',
    stats: { bookCount: 15, momentCount: 31, highlightCount: 24, reviewCount: 7, firstSeenAt: 1706716800, longTerm: false },
    books: [
      { bookId: 'bk_2001', title: '人类简史', author: '尤瓦尔·赫拉利', cover: '', momentCount: 8 },
    ],
    moments: [
      {
        _id: 'm_03', type: 'highlight', categoryId: 'cat_history', createdAt: 1733011200,
        text: '我们研究历史，不是为了知道未来，而是为了拓宽视野，理解现在的种种并非必然。',
        book: { bookId: 'bk_2001', title: '人类简史', cover: '' },
      },
    ],
    trend: { byYear: [{ year: 2025, count: 12 }] },
    relatedTopics: [],
  },

  // tag_03 故意不带 headline/points（模拟旧分析文档），验证云端兜底：
  // headline 取 summary 首句；points 退化为一张「整体判断」卡（text = reasoning）
  tag_03: {
    name: '浪漫主义者',
    summary: '你在小说里寻找诗意，又在现实题材里寻找答案。虚构与非虚构的交替阅读，构成了你一年中最稳定的节奏。',
    reasoning: '文学与纪实类作品交替出现在你的阅读序列中，划线风格也随之切换：小说里摘句子，纪实里记观点。',
    stats: { bookCount: 8, momentCount: 15, highlightCount: 11, reviewCount: 4, firstSeenAt: 1711929600, longTerm: false },
    books: [
      { bookId: 'bk_3001', title: '月亮与六便士', author: '毛姆', cover: '', momentCount: 6 },
    ],
    moments: [
      {
        _id: 'm_04', type: 'highlight', categoryId: 'cat_literature', createdAt: 1725148800,
        text: '满地都是六便士，他却抬头看见了月亮。',
        book: { bookId: 'bk_3001', title: '月亮与六便士', cover: '' },
      },
    ],
    trend: { byYear: [{ year: 2025, count: 9 }] },
    relatedTopics: [],
  },
};

// 复刻云端 tagsDetail 的兜底逻辑：headline 缺失取 summary 首句，points 缺失退化为「整体判断」卡
function buildDetail(tagId) {
  const detail = DETAILS[tagId];
  if (!detail) return null;
  const fallbackHeadline = (detail.summary || '').split(/[。！？.!?]/)[0] || '';
  const points = Array.isArray(detail.points) && detail.points.length
    ? detail.points
    : [{ title: '整体判断', text: detail.reasoning || detail.summary || '' }];
  return {
    tagId,
    ...detail,
    headline: detail.headline || fallbackHeadline,
    points,
    feedback: feedbackState[tagId] || null,
  };
}

const details = Object.keys(DETAILS).map((id) => ({
  path: `/tags/${id}`,
  data: () => buildDetail(id),
}));

const feedbacks = Object.keys(DETAILS).map((id) => ({
  path: `/tags/${id}/feedback`,
  data: (params) => {
    feedbackState[id] = params.type;
    return {};
  },
}));

export default [...details, ...feedbacks];
