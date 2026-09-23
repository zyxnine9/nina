/**
 * NINA 全局配置（收敛到单文件，勿在别处再建 config）
 */
export default {
  /** true: 使用本地 mock（WxMock 拦截 wx.request），false: 走真实后端 */
  isMock: true,
  /** true: 通过 wx.cloud.callFunction 调用云函数 nina-api（需配合 isMock=false 使用） */
  useCallFunction: false,
  /** 云开发环境 ID */
  envId: 'cloudbase-d7g7rfps86982b7da',
  /** 后端网关云函数名（回退别名：action 未命中函数映射时走这里） */
  cloudFunctionName: 'nina-api',
  /** 按业务域拆分的云函数映射（Phase E 收尾后 cloudFunctionName 别名可删） */
  cloudFunctions: {
    auth: 'nina-auth',
    import: 'nina-import',
    content: 'nina-content',
    analysis: 'nina-analysis',
    insight: 'nina-insight',
    search: 'nina-search',
  },
  /** HTTP 云函数（常驻 Web 服务，wx.cloud.callHTTPFunction，支持 SSE） */
  cloudHttpFunctionName: 'nina-http',
  /** REST 后端地址（仅 isMock=false 且 useCallFunction=false 时使用） */
  baseUrl: '',
};
