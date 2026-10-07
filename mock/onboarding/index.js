/**
 * 引导流程 mock：/user/profile 返回未导入状态（hasKey:false），
 * 供 app.js 启动判断进入 onboarding 流程。
 */
export default [
  {
    path: '/user/profile',
    data: {
      userId: 'mock-user',
      nickname: 'NINA 用户',
      avatar: '',
      hasKey: false,
      keyStatus: 'none',
      keyHint: '',
      keyUpdatedAt: 0,
      lastSyncAt: 0,
      stats: { bookCount: 0, momentCount: 0, analysisAt: 0 },
    },
  },
];
