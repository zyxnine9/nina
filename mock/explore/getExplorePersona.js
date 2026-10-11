// 探索·阅读人格 GET /explore/persona（形状对齐云端 PRD 9.2：basis + archetype + rhythm + myFeedback）
export default {
  path: '/explore/persona',
  data: {
    dimension: 'persona',
    title: '阅读人格',
    summary: '你在安静时段进入深处，再用自己的经验完成判断。',
    basis: { readDays: 275, bookCount: 42 },
    archetype: {
      kind: 'fictional_character',
      name: '悉达多',
      sourceTitle: '悉达多',
      portraitAsset: '',
      framing: '你的阅读让人联想到河边的摆渡人',
      traits: [
        {
          name: '相信亲身经验',
          description: '你不太接受现成的答案，总要自己走过一遍才算数。书里的结论对你更像路标，而不是终点。',
          behaviorEvidence: ['写下 36 条评论', '累计阅读 275 天'],
        },
        {
          name: '在安静中沉浸',
          description: '夜深时的阅读时长最长，你习惯在安静里把一本书读进深处。',
          behaviorEvidence: ['夜间阅读占 24%', '阅读高峰在 22 点'],
        },
        {
          name: '持续而温和的节奏',
          description: '不追求一口气读完，但你几乎每天都在场。长期的稳定让你的阅读有积累的厚度。',
          behaviorEvidence: ['活跃阅读天数 275 天', '读过 42 本书'],
        },
      ],
    },
    rhythm: {
      peakHour: 9,
      nightRatio: 0.24,
      avgSessionSeconds: 2400,
      readDays: 275,
      totalReadTime: 990000,
    },
    myFeedback: null,
  },
};
