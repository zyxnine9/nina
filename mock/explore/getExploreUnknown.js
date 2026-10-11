// 探索·未读之境 GET /explore/unknown（形状对齐云端 PRD 9.3：affinityLabel + connections + entry 多形态）
export default {
  path: '/explore/unknown',
  data: {
    dimension: 'unknown',
    title: '未读之境',
    summary: '三个你可能会喜欢的新方向',
    basis: { bookCount: 42 },
    forming: false,
    items: [
      {
        id: 'u_1',
        name: '人类学',
        intro: '从他人的日常仪式里，看清我们自己对意义的需求。',
        affinityLabel: '连接很强',
        reason: '你反复关注「人的处境」，人类学把这个问题放进真实的田野与村落里回答。',
        connections: [
          { type: 'topic', name: '人与文化', evidenceMomentIds: ['m_u_1'] },
          { type: 'topic', name: '仪式与意义', evidenceMomentIds: [] },
        ],
        entry: {
          type: 'book_list',
          title: '从《天真的人类学家》等几本入门书开始',
          payload: {
            books: [
              { bookId: 'b_u_1', title: '天真的人类学家', author: '奈吉尔·巴利', cover: '' },
              { bookId: 'b_u_2', title: '忧郁的热带', author: '克洛德·列维-斯特劳斯', cover: '' },
              { bookId: 'b_u_3', title: '手机里的人类学家', author: '项飙', cover: '' },
            ],
          },
        },
        myFeedback: null,
      },
      {
        id: 'u_2',
        name: '科学史',
        intro: '看每一次「已知」如何被推翻，理解知识本身的性格。',
        affinityLabel: '值得试试',
        reason: '你的质疑式评论显示你喜欢检验观点，科学史正是一部「观点如何被检验」的历史。',
        connections: [{ type: 'topic', name: '怀疑的力量', evidenceMomentIds: [] }],
        entry: {
          type: 'book',
          title: '从《世界观》开始',
          payload: {
            books: [{ bookId: 'b_u_4', title: '世界观', author: '理查德·德威特', cover: '' }],
          },
        },
        myFeedback: null,
      },
      {
        id: 'u_3',
        name: '城市研究',
        intro: '街道、街角与邻居，如何悄悄塑造你的感受与判断。',
        affinityLabel: '意外的可能',
        reason: '你在小说里常留意空间与人的关系，城市研究把这个直觉变成一门学问。',
        connections: [],
        entry: {
          type: 'question',
          title: '带着「街道如何塑造我们的感知」的问题去读一读',
          payload: {},
        },
        myFeedback: null,
      },
    ],
  },
};
