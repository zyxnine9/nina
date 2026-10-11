// GET /knowledge/{id} 知识气泡详情
// 动态路径按具体 id 注册（WxMock 精确 URL 匹配）；形状逐字段对齐云端 knowledgeDetail：
// { id, name, percent, minutes, bookCount, momentCount, children: [{ id, name, percent, bookCount, momentCount, desc, common, books: [{bookId,title,cover}] }] }
// 验证点：k_5 中国史 desc/common=''（隐藏行）；k_7 children=[]（空态）

const DETAILS = {
  k_1: {
    name: '人文社科',
    percent: 28,
    minutes: 4667,
    bookCount: 24,
    momentCount: 96,
    children: [
      {
        id: 'k_1_哲学思想',
        name: '哲学思想',
        percent: 38,
        bookCount: 9,
        momentCount: 41,
        desc: '你反复回到那些没有标准答案的问题上，比起记住谁的结论，你更在意论证是怎么一步步搭起来的。',
        common: '这些书都在教你如何审视前提，而不是直接接受一个现成的世界观。',
        books: [
          { bookId: 'bk_101', title: '苏格拉底的申辩', cover: '' },
          { bookId: 'bk_102', title: '西方哲学史', cover: '' },
          { bookId: 'bk_103', title: '沉思录', cover: '' },
        ],
      },
      {
        id: 'k_1_社会学',
        name: '社会学',
        percent: 33,
        bookCount: 8,
        momentCount: 33,
        desc: '你习惯把个人的处境放回时代与结构里看，划线常落在解释「我们为何如此生活」的段落。',
        common: '都在追问个体与群体之间的张力，秩序是如何被建立又被打破的。',
        books: [
          { bookId: 'bk_104', title: '乡土中国', cover: '' },
          { bookId: 'bk_105', title: '乌合之众', cover: '' },
        ],
      },
      {
        id: 'k_1_人类学',
        name: '人类学',
        percent: 17,
        bookCount: 4,
        momentCount: 13,
        desc: '异文化的案例最让你着迷，你借它们校准自己习以为常的那些「常识」。',
        common: '都在用远方的镜子反照自己的生活，让你重新看见被忽略的日常。',
        books: [{ bookId: 'bk_106', title: '天真的人类学家', cover: '' }],
      },
      {
        id: 'k_1_政治经济',
        name: '政治经济',
        percent: 12,
        bookCount: 3,
        momentCount: 9,
        desc: '你关注规则背后的利益结构，读得不多，但每一本都留了不少划线。',
        common: '都在拆解权力与资源如何分配，谁在制定规则，谁在承担代价。',
        books: [{ bookId: 'bk_107', title: '规训与惩罚', cover: '' }],
      },
    ],
  },

  k_2: {
    name: '科技与互联网',
    percent: 22,
    minutes: 3667,
    bookCount: 19,
    momentCount: 74,
    children: [
      {
        id: 'k_2_计算机科学',
        name: '计算机科学',
        percent: 42,
        bookCount: 8,
        momentCount: 36,
        desc: '这是你投入最深的一块，你似乎偏爱讲透底层原理的书，而不是速成的技巧合集。',
        common: '都在把复杂系统拆成简单机制的组合，让你看清抽象之下的骨架。',
        books: [
          { bookId: 'bk_201', title: '深入理解计算机系统', cover: '' },
          { bookId: 'bk_202', title: '代码大全', cover: '' },
          { bookId: 'bk_203', title: '算法导论', cover: '' },
        ],
      },
      {
        id: 'k_2_互联网',
        name: '互联网',
        percent: 32,
        bookCount: 6,
        momentCount: 24,
        desc: '你读它像在读一门仍在发生的 History，关心产品与技术如何互相塑造。',
        common: '都在记录一场技术扩散如何改写商业与人的行为方式。',
        books: [
          { bookId: 'bk_204', title: '浪潮之巅', cover: '' },
          { bookId: 'bk_205', title: '失控', cover: '' },
        ],
      },
      {
        id: 'k_2_科普',
        name: '科普',
        percent: 26,
        bookCount: 5,
        momentCount: 14,
        desc: '科普是你的呼吸位，你用它保持对世界的好奇，也常在里面找到跨界的隐喻。',
        common: '都在把硬知识翻译成好懂的图景，让你随时能换一双眼睛看问题。',
        books: [{ bookId: 'bk_206', title: '时间简史', cover: '' }],
      },
    ],
  },

  k_3: {
    name: '心理学',
    percent: 15,
    minutes: 2500,
    bookCount: 15,
    momentCount: 52,
    children: [
      {
        id: 'k_3_认知心理',
        name: '认知心理',
        percent: 47,
        bookCount: 7,
        momentCount: 29,
        desc: '你关心大脑是怎么想问题的，划线多在那些推翻直觉的实验结论旁边。',
        common: '都在用实验证据挑战你的直觉，暴露思维里那些系统性的偏差。',
        books: [
          { bookId: 'bk_301', title: '思考，快与慢', cover: '' },
          { bookId: 'bk_302', title: '贪多做一定对吗', cover: '' },
          { bookId: 'bk_303', title: '心智探奇', cover: '' },
        ],
      },
      {
        id: 'k_3_社会心理',
        name: '社会心理',
        percent: 33,
        bookCount: 5,
        momentCount: 15,
        desc: '你在人群与自我之间来回打量，想知道环境在多大程度上塑造了选择。',
        common: '都在解释情境的力量，为什么好人也会做出意想不到的事。',
        books: [{ bookId: 'bk_304', title: '社会性动物', cover: '' }],
      },
      {
        id: 'k_3_心理咨询',
        name: '心理咨询',
        percent: 20,
        bookCount: 3,
        momentCount: 8,
        desc: '这一块读得轻而慢，像是给自己的情绪找一个可以安放的解释框架。',
        common: '都在提供一种温柔的对话方式，让感受被看见而不是被评判。',
        books: [{ bookId: 'bk_305', title: '也许你该找个人聊聊', cover: '' }],
      },
    ],
  },

  k_4: {
    name: '经济管理',
    percent: 12,
    minutes: 2000,
    bookCount: 12,
    momentCount: 41,
    children: [
      {
        id: 'k_4_商业思维',
        name: '商业思维',
        percent: 42,
        bookCount: 5,
        momentCount: 19,
        desc: '你喜欢拆公司多于追热点，划线常落在商业模式的因果链条上。',
        common: '都在回答同一个问题：价值从哪里来，又靠什么持续下去。',
        books: [
          { bookId: 'bk_401', title: '零边际成本社会', cover: '' },
          { bookId: 'bk_402', title: '创新者的窘境', cover: '' },
        ],
      },
      {
        id: 'k_4_金融投资',
        name: '金融投资',
        percent: 33,
        bookCount: 4,
        momentCount: 14,
        desc: '你读投资更像在读人性，反复出现的关键词是长期与纪律。',
        common: '都在讲如何与不确定性共处，用规则而不是情绪做决定。',
        books: [{ bookId: 'bk_403', title: '聪明的投资者', cover: '' }],
      },
      {
        id: 'k_4_个人成长',
        name: '个人成长',
        percent: 25,
        bookCount: 3,
        momentCount: 8,
        desc: '这一类书是你的方法库，你关心的是可以明天就上手的小改动。',
        common: '都在把大目标翻译成可执行的小步骤，强调反馈与迭代。',
        books: [{ bookId: 'bk_404', title: '原子习惯', cover: '' }],
      },
    ],
  },

  // 中国史故意 desc/common 为空串：验证前端隐藏该行
  k_5: {
    name: '历史',
    percent: 10,
    minutes: 1667,
    bookCount: 10,
    momentCount: 33,
    children: [
      {
        id: 'k_5_世界史',
        name: '世界史',
        percent: 60,
        bookCount: 6,
        momentCount: 22,
        desc: '你偏爱大尺度的叙事，帝国的兴衰在你的划线里反复出现。',
        common: '都在用长时段的视角看文明，繁荣与危机总是周期性地回来。',
        books: [
          { bookId: 'bk_501', title: '枪炮、病菌与钢铁', cover: '' },
          { bookId: 'bk_502', title: '人类简史', cover: '' },
        ],
      },
      {
        id: 'k_5_中国史',
        name: '中国史',
        percent: 40,
        bookCount: 4,
        momentCount: 11,
        desc: '',
        common: '',
        books: [{ bookId: 'bk_503', title: '万历十五年', cover: '' }],
      },
    ],
  },

  k_6: {
    name: '文学艺术',
    percent: 8,
    minutes: 1333,
    bookCount: 8,
    momentCount: 27,
    children: [
      {
        id: 'k_6_小说',
        name: '小说',
        percent: 63,
        bookCount: 5,
        momentCount: 19,
        desc: '小说是你的避风港，你摘下的句子大多关于人在困境里的选择。',
        common: '都在讲普通人在命运面前的姿态，克制之下藏着汹涌。',
        books: [
          { bookId: 'bk_601', title: '月亮与六便士', cover: '' },
          { bookId: 'bk_602', title: '百年孤独', cover: '' },
          { bookId: 'bk_603', title: '局外人', cover: '' },
        ],
      },
      {
        id: 'k_6_散文随笔',
        name: '散文随笔',
        percent: 37,
        bookCount: 3,
        momentCount: 8,
        desc: '随笔是你随手翻开的那一类，短段落里藏着你的呼吸节奏。',
        common: '都在把日常观察写成小心思，读起来像一次散步。',
        books: [{ bookId: 'bk_604', title: '目送', cover: '' }],
      },
    ],
  },

  // 空态：无二级分类
  k_7: {
    name: '其他',
    percent: 5,
    minutes: 833,
    bookCount: 5,
    momentCount: 14,
    children: [],
  },
};

const details = Object.keys(DETAILS).map((id) => ({
  path: `/knowledge/${id}`,
  data: { id, ...DETAILS[id] },
}));

export default details;
