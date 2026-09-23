// NINA_API.md 5.2 GET /tags
export default {
  path: '/tags',
  data: {
    nextCursor: null,
    items: [
      {
        tagId: 'tag_01',
        name: '温和的怀疑者',
        summary: '基于你的阅读痕迹，我们推测：你不轻易接受权威结论，但也不为反对而反对。',
        evidenceCount: 37,
        bookCount: 12,
        momentCount: 23,
        feedback: null,
        speculative: true,
      },
      {
        tagId: 'tag_02',
        name: '方法论收藏家',
        summary: '你习惯收集各种决策与思考框架，像整理工具箱一样整理它们。',
        evidenceCount: 28,
        bookCount: 9,
        momentCount: 31,
        feedback: null,
        speculative: true,
      },
      {
        tagId: 'tag_03',
        name: '浪漫现实主义者',
        summary: '你在小说里寻找诗意，又在现实题材里寻找答案。',
        evidenceCount: 19,
        bookCount: 8,
        momentCount: 15,
        feedback: null,
        speculative: true,
      },
      {
        tagId: 'tag_04',
        name: '夜的读者',
        summary: '你的大部分划线发生在深夜，那是一天中你与自己对话的时刻。',
        evidenceCount: 14,
        bookCount: 11,
        momentCount: 18,
        feedback: null,
        speculative: true,
      },
    ],
  },
};
