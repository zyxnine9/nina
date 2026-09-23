// NINA_API.md 6.2.2 GET /explore/interest（dimension=interest）
export default {
  path: '/explore/interest',
  data: {
    dimension: 'interest',
    title: '兴趣结构',
    summary: '你真正反复回到的是「人的处境」',
    items: [
      { id: 'i_philosophy', name: '哲学', bookCount: 18, momentCount: 63, spreadBooks: 9 },
      { id: 'i_sociology', name: '社会学', bookCount: 12, momentCount: 41, spreadBooks: 7 },
      { id: 'i_behavior_econ', name: '行为经济学', bookCount: 9, momentCount: 30, spreadBooks: 6 },
      { id: 'i_ai_future', name: 'AI 与未来', bookCount: 8, momentCount: 26, spreadBooks: 5 },
      { id: 'i_globalization', name: '全球化', bookCount: 6, momentCount: 19, spreadBooks: 4 },
      { id: 'i_psych', name: '心理学', bookCount: 15, momentCount: 52, spreadBooks: 8 },
    ],
    evidence: [],
  },
};
