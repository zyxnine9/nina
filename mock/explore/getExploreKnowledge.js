// NINA_API.md 6.2.1 GET /explore/knowledge（dimension=knowledge）
// id 对齐云端 analyzer 输出格式 k_1..k_7（详情页 mock 按具体 id 注册，见 getKnowledgeDetail.js）
export default {
  path: '/explore/knowledge',
  data: {
    dimension: 'knowledge',
    title: '知识结构',
    summary: '人文社科与科技互联网构成你的两大支柱',
    items: [
      {
        id: 'k_1',
        name: '人文社科',
        level: 'core',
        readingTime: 280000,
        bookCount: 24,
        momentCount: 96,
        children: [
          { id: 'k_1_哲学思想', name: '哲学思想', bookCount: 9 },
          { id: 'k_1_社会学', name: '社会学', bookCount: 8 },
          { id: 'k_1_人类学', name: '人类学', bookCount: 4 },
          { id: 'k_1_政治经济', name: '政治经济', bookCount: 3 },
        ],
      },
      {
        id: 'k_2',
        name: '科技与互联网',
        level: 'core',
        readingTime: 220000,
        bookCount: 19,
        momentCount: 74,
        children: [
          { id: 'k_2_计算机科学', name: '计算机科学', bookCount: 8 },
          { id: 'k_2_互联网', name: '互联网', bookCount: 6 },
          { id: 'k_2_科普', name: '科普', bookCount: 5 },
        ],
      },
      {
        id: 'k_3',
        name: '心理学',
        level: 'core',
        readingTime: 150000,
        bookCount: 15,
        momentCount: 52,
        children: [
          { id: 'k_3_认知心理', name: '认知心理', bookCount: 7 },
          { id: 'k_3_社会心理', name: '社会心理', bookCount: 5 },
          { id: 'k_3_心理咨询', name: '心理咨询', bookCount: 3 },
        ],
      },
      {
        id: 'k_4',
        name: '经济管理',
        level: 'sub',
        readingTime: 120000,
        bookCount: 12,
        momentCount: 41,
        children: [
          { id: 'k_4_商业思维', name: '商业思维', bookCount: 5 },
          { id: 'k_4_金融投资', name: '金融投资', bookCount: 4 },
          { id: 'k_4_个人成长', name: '个人成长', bookCount: 3 },
        ],
      },
      {
        id: 'k_5',
        name: '历史',
        level: 'sub',
        readingTime: 100000,
        bookCount: 10,
        momentCount: 33,
        children: [
          { id: 'k_5_世界史', name: '世界史', bookCount: 6 },
          { id: 'k_5_中国史', name: '中国史', bookCount: 4 },
        ],
      },
      {
        id: 'k_6',
        name: '文学艺术',
        level: 'sub',
        readingTime: 80000,
        bookCount: 8,
        momentCount: 27,
        children: [
          { id: 'k_6_小说', name: '小说', bookCount: 5 },
          { id: 'k_6_散文随笔', name: '散文随笔', bookCount: 3 },
        ],
      },
      { id: 'k_7', name: '其他', level: 'related', readingTime: 50000, bookCount: 5, momentCount: 14, children: [] },
    ],
    evidence: [],
  },
};
