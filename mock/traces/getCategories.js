// NINA_API.md 8.3 GET /categories — 固定大类 + AI 动态细分
export default {
  path: '/categories',
  data: {
    items: [
      {
        categoryId: 'c_method',
        name: '方法论',
        momentCount: 320,
        children: [{ categoryId: 'c_method_decision', name: '决策', momentCount: 87 }],
      },
      {
        categoryId: 'c_psych',
        name: '心理',
        momentCount: 264,
        children: [{ categoryId: 'c_psych_self', name: '自我', momentCount: 112 }],
      },
      {
        categoryId: 'c_philosophy',
        name: '哲学',
        momentCount: 198,
        children: [{ categoryId: 'c_philosophy_free', name: '自由', momentCount: 64 }],
      },
      {
        categoryId: 'c_story',
        name: '故事',
        momentCount: 176,
        children: [{ categoryId: 'c_story_social', name: '社会小说', momentCount: 89 }],
      },
      {
        categoryId: 'c_life',
        name: '人生',
        momentCount: 143,
        children: [{ categoryId: 'c_life_growth', name: '成长', momentCount: 57 }],
      },
    ],
  },
};
