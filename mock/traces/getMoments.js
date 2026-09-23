// NINA_API.md 8.1 GET /moments
// 函数式 mock：支持 type / categoryId / limit 过滤（WxMock 顶层函数模板，见 mock/index.js）
const ALL_MOMENTS = [
  {
    momentId: 'm_001',
    type: 'highlight',
    text: '我想我们没有失明，我想我们本来是盲人。看得见却不看，才是真正的失明。',
    comment: null,
    book: { bookId: '924389', title: '失明症漫记', author: '若泽·萨拉马戈', cover: '' },
    chapterTitle: '17',
    categoryId: 'c_philosophy',
    categoryName: '哲学',
    createdAt: 1789000000,
  },
  {
    momentId: 'm_002',
    type: 'review',
    text: '除非你把人生的选择权从别人手里拿回来，否则你永远只是别人剧本里的角色。',
    comment: '这句我读了三遍',
    book: { bookId: '102531', title: '被讨厌的勇气', author: '岸见一郎 / 古贺史健', cover: '' },
    chapterTitle: '第三夜',
    categoryId: 'c_psych',
    categoryName: '心理',
    createdAt: 1787000000,
  },
  {
    momentId: 'm_003',
    type: 'highlight',
    text: '决策的本质不是选择最好的选项，而是放弃最少的那个。',
    comment: null,
    book: { bookId: '201883', title: '思考，快与慢', author: '丹尼尔·卡尼曼', cover: '' },
    chapterTitle: '第 13 章',
    categoryId: 'c_method_decision',
    categoryName: '决策',
    createdAt: 1785000000,
  },
  {
    momentId: 'm_004',
    type: 'highlight',
    text: '有一样东西无法被没收，那就是一个人在内心为自己保留的自由。',
    comment: null,
    book: { bookId: '924389', title: '失明症漫记', author: '若泽·萨拉马戈', cover: '' },
    chapterTitle: '9',
    categoryId: 'c_philosophy_free',
    categoryName: '自由',
    createdAt: 1783400000,
  },
  {
    momentId: 'm_005',
    type: 'review',
    text: '人不是在故事里逃避现实，而是在故事里练习活着。',
    comment: '写给这本书，也写给自己',
    book: { bookId: '305117', title: '偷书贼', author: '马克斯·苏萨克', cover: '' },
    chapterTitle: '尾声',
    categoryId: 'c_story',
    categoryName: '故事',
    createdAt: 1782000000,
  },
  {
    momentId: 'm_006',
    type: 'highlight',
    text: '孤独不是一种状态，而是一种能力：与自己相处而不感到慌张。',
    comment: null,
    book: { bookId: '408262', title: '百年孤独', author: '加西亚·马尔克斯', cover: '' },
    chapterTitle: '第 20 章',
    categoryId: 'c_life_growth',
    categoryName: '成长',
    createdAt: 1780500000,
  },
  {
    momentId: 'm_007',
    type: 'highlight',
    text: '许多人从未真正做过决定，他们只是按照别人给出的选项生活。',
    comment: '像在说我',
    book: { bookId: '102531', title: '被讨厌的勇气', author: '岸见一郎 / 古贺史健', cover: '' },
    chapterTitle: '第一夜',
    categoryId: 'c_psych_self',
    categoryName: '自我',
    createdAt: 1779000000,
  },
  {
    momentId: 'm_008',
    type: 'highlight',
    text: '如果一个办法有效，那它看起来古怪也没关系；如果它无效，那再优雅也是错的。',
    comment: null,
    book: { bookId: '510044', title: '穷查理宝典', author: '查理·芒格', cover: '' },
    chapterTitle: '第十一讲',
    categoryId: 'c_method',
    categoryName: '方法论',
    createdAt: 1777600000,
  },
  {
    momentId: 'm_009',
    type: 'review',
    text: '我们终于要懂得，欣赏当下，与生活的平凡和解。',
    comment: null,
    book: { bookId: '408262', title: '百年孤独', author: '加西亚·马尔克斯', cover: '' },
    chapterTitle: '第 1 章',
    categoryId: 'c_life',
    categoryName: '人生',
    createdAt: 1775400000,
  },
  {
    momentId: 'm_010',
    type: 'highlight',
    text: '他知道自己想要什么，这份笃定本身就是一种罕见的幸运。',
    comment: null,
    book: { bookId: '617352', title: '局外人', author: '阿尔贝·加缪', cover: '' },
    chapterTitle: '第二部',
    categoryId: 'c_philosophy',
    categoryName: '哲学',
    createdAt: 1773000000,
  },
];

export default {
  path: '/moments',
  data(params = {}) {
    let items = ALL_MOMENTS;
    if (params.type) {
      items = items.filter((m) => m.type === params.type);
    }
    if (params.categoryId) {
      // 命中父分类或其细分（前缀约定：c_philosophy_free 属于 c_philosophy）
      const prefix = `${params.categoryId}_`;
      items = items.filter(
        (m) => m.categoryId === params.categoryId || m.categoryId.startsWith(prefix),
      );
    }
    const limit = Number(params.limit) || items.length;
    return {
      nextCursor: items.length > limit ? 'cur_next' : null,
      items: items.slice(0, limit),
    };
  },
};
