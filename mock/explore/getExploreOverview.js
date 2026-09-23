// NINA_API.md 6.1 GET /explore/overview
export default {
  path: '/explore/overview',
  data: {
    dimensions: [
      { key: 'knowledge', title: '知识结构', oneLine: '经济与文学构成你的两大支柱', itemCount: 8 },
      { key: 'interest', title: '兴趣结构', oneLine: "你真正反复回到的是'人的处境'", itemCount: 6 },
      { key: 'thinking', title: '思维方式', oneLine: '你习惯用例子反驳定义', itemCount: 4 },
      { key: 'long_term', title: '长期关注', oneLine: '自由与自我欺骗出现了 4 年', itemCount: 5 },
      { key: 'persona', title: '阅读人格', oneLine: '夜间的沉浸式读者', itemCount: 3 },
      { key: 'unknown', title: '未知领域', oneLine: '这些领域可能与你高度相关', itemCount: 7 },
    ],
  },
};
