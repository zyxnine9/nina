// 探索·思维方式 GET /explore/thinking（形状对齐云端 PRD 9.1：basis + items[].evidenceGroups + forming）
export default {
  path: '/explore/thinking',
  data: {
    dimension: 'thinking',
    title: '思维方式',
    summary: '你很少被动接受一个观点，更习惯用具体经验检验它。',
    basis: { commentCount: 36, bookCount: 12 },
    forming: false,
    items: [
      {
        id: 'th_1',
        name: '例证式思维',
        description: '你常用具体经验检验抽象定义',
        momentCount: 12,
        evidenceGroups: [
          {
            sourceMomentId: 'm_th_1',
            sourceText: '人应该知道自己无知的边界，这样他才算真正拥有知识。',
            userResponse: '可是生活中大多数时候，我们是先行动再弄懂的。知道边界固然重要，但行动本身也在划出边界。',
            bookTitle: '人类简史',
            chapterTitle: '第二章 知以为树',
          },
          {
            sourceMomentId: 'm_th_2',
            sourceText: '自由不是随心所欲，而是自我主宰。',
            userResponse: '按这个定义，我上次说走就走的旅行不是自由，只是任性。真正的自由可能更接近自律。',
            bookTitle: '人生的智慧',
            chapterTitle: '',
          },
        ],
      },
      {
        id: 'th_2',
        name: '质疑式思维',
        description: '你习惯对作者的观点提出反例',
        momentCount: 9,
        evidenceGroups: [
          {
            sourceMomentId: 'm_th_3',
            sourceText: '习惯是人生的伟大指南。',
            userResponse: '习惯也是平庸的温床。作者只说了习惯好的一面，坏习惯的惯性他没讨论。',
            bookTitle: '人性的弱点',
            chapterTitle: '',
          },
        ],
      },
      {
        id: 'th_3',
        name: '联系式思维',
        description: '你常把不同书籍的观点连起来看',
        momentCount: 7,
        evidenceGroups: [
          {
            sourceMomentId: 'm_th_4',
            sourceText: '一切历史都是当代史。',
            userResponse: '和上一本说的「记忆塑造身份」是一件事的两面。历史是国家层面的记忆，记忆是个体层面的历史。',
            bookTitle: '万历十五年',
            chapterTitle: '自序',
          },
        ],
      },
    ],
  },
};
