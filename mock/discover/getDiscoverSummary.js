// NINA_API.md 5.1 GET /discover/summary
export default {
  path: '/discover/summary',
  data: {
    headline: {
      text: '你读了很多不同的书，但你似乎一直在寻找同一个答案。',
      generateAt: 1790035200,
    },
    primaryTag: {
      tagId: 'tag_01',
      name: '温和的怀疑者',
      reason: '为什么是我？',
      evidenceCount: 37,
    },
    tags: [
      { tagId: 'tag_02', name: '方法论收藏家' },
      { tagId: 'tag_03', name: '浪漫现实主义者' },
    ],
    newInsight: {
      id: 'ins_09',
      title: "你最近的三本书都在讨论'改变'这件事",
    },
  },
};
