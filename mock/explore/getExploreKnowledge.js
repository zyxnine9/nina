// NINA_API.md 6.2.1 GET /explore/knowledge（dimension=knowledge）
// percent 由前端按 readingTime 占比计算：readingTime = percent × 10000，总和 1,000,000
export default {
  path: '/explore/knowledge',
  data: {
    dimension: 'knowledge',
    title: '知识结构',
    summary: '人文社科与科技互联网构成你的两大支柱',
    items: [
      { id: 'k_humanities', name: '人文社科', level: 'core', readingTime: 280000, bookCount: 24, momentCount: 96, children: [] },
      { id: 'k_tech', name: '科技与互联网', level: 'core', readingTime: 220000, bookCount: 19, momentCount: 74, children: [] },
      { id: 'k_psych', name: '心理学', level: 'core', readingTime: 150000, bookCount: 15, momentCount: 52, children: [] },
      { id: 'k_biz', name: '经济管理', level: 'sub', readingTime: 120000, bookCount: 12, momentCount: 41, children: [] },
      { id: 'k_history', name: '历史', level: 'sub', readingTime: 100000, bookCount: 10, momentCount: 33, children: [] },
      { id: 'k_art', name: '文学艺术', level: 'sub', readingTime: 80000, bookCount: 8, momentCount: 27, children: [] },
      { id: 'k_other', name: '其他', level: 'related', readingTime: 50000, bookCount: 5, momentCount: 14, children: [] },
    ],
    evidence: [],
  },
};
