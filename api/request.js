import config from '~/config';

const { baseUrl } = config;
const delay = config.isMock ? 500 : 0;

/** 云函数懒初始化标记 */
let cloudInited = false;
function ensureCloudInit() {
  if (!wx.cloud) return false;
  if (!cloudInited) {
    wx.cloud.init({ env: config.envId, traceUser: true });
    cloudInited = true;
  }
  return true;
}

/**
 * action → 云函数名映射（按业务域拆分，29 个 action 显式枚举）。
 * 未命中的 action 回退到 config.cloudFunctionName（nina-api 金丝雀），并 warn 便于发现遗漏。
 */
const ACTION_FUNCTION = {
  // nina-auth
  auth_login: 'auth',
  user_profile: 'auth',
  user_update_profile: 'auth',
  // nina-import
  import_key: 'import',
  import_status: 'import',
  import_step: 'import',
  import_sync: 'import',
  // nina-content
  moments_list: 'content',
  moments_detail: 'content',
  categories: 'content',
  books_list: 'content',
  topics_list: 'content',
  topics_detail: 'content',
  share_cards: 'content',
  // nina-analysis
  analysis_run: 'analysis',
  analysis_status: 'analysis',
  analysis_step: 'analysis',
  // nina-insight
  discover_summary: 'insight',
  tags_list: 'insight',
  tags_detail: 'insight',
  tags_feedback: 'insight',
  explore_overview: 'insight',
  explore_knowledge: 'insight',
  explore_interest: 'insight',
  explore_thinking: 'insight',
  explore_long_term: 'insight',
  explore_persona: 'insight',
  explore_unknown: 'insight',
  explore_map: 'insight',
  // nina-search
  search: 'search',
};

/**
 * 直接调用云函数 action（NINA 后端统一入口）。
 * 调试页 / longTask 等新代码直接用这个，不经过 REST 路径映射。
 * 回包归一化为 { statusCode, data: { code, message, data } }
 */
export function callAction(action, params = {}) {
  if (!ensureCloudInit()) {
    return Promise.reject({ errMsg: 'wx.cloud 不可用（基础库过低）' });
  }
  const domain = ACTION_FUNCTION[action];
  const name = (domain && config.cloudFunctions && config.cloudFunctions[domain]) || config.cloudFunctionName;
  if (!domain) {
    console.warn(`[callAction] action 未配置函数映射，回退 ${name}: ${action}`);
  }
  return wx.cloud
    .callFunction({ name, data: { action, params } })
    .then((res) => {
      const result = res.result || {};
      const code = typeof result.code === 'number' ? result.code : 50000;
      return {
        statusCode: code === 0 ? 200 : 500,
        data: { code, message: result.message || 'ok', data: result.data ?? null, success: code === 0 },
      };
    })
    .catch((err) => {
      // callFunction 本身失败（函数不存在/超时等）
      throw {
        errMsg: err.errMsg || 'callFunction fail',
        data: { code: 50000, message: err.errMsg || '云函数调用失败', data: null, success: false },
      };
    });
}

/**
 * NINA REST 路径 → 云函数 action 映射。
 * 老页面零改动：仍调用 request('/moments', 'get', {...})，由这里翻译成 {action, params}。
 */
const ROUTES = [
  { pattern: /^\/auth\/login$/, action: 'auth_login' },
  { pattern: /^\/user\/profile$/, action: 'user_profile' },
  { pattern: /^\/import\/key$/, action: 'import_key' },
  { pattern: /^\/import\/status$/, action: 'import_status' },
  { pattern: /^\/import\/step$/, action: 'import_step' },
  { pattern: /^\/import\/sync$/, action: 'import_sync' },
  { pattern: /^\/analysis\/run$/, action: 'analysis_run' },
  { pattern: /^\/analysis\/status$/, action: 'analysis_status' },
  { pattern: /^\/analysis\/step$/, action: 'analysis_step' },
  { pattern: /^\/discover\/summary$/, action: 'discover_summary' },
  { pattern: /^\/tags$/, action: 'tags_list' },
  { pattern: /^\/tags\/([^/]+)\/feedback$/, action: 'tags_feedback', ids: ['tagId'] },
  { pattern: /^\/tags\/([^/]+)$/, action: 'tags_detail', ids: ['tagId'] },
  { pattern: /^\/explore\/overview$/, action: 'explore_overview' },
  { pattern: /^\/explore\/map$/, action: 'explore_map' },
  { pattern: /^\/explore\/(knowledge|interest|thinking|long_term|persona|unknown)$/, action: 'explore_dim', ids: ['dimension'] },
  { pattern: /^\/topics$/, action: 'topics_list' },
  { pattern: /^\/topics\/([^/]+)$/, action: 'topics_detail', ids: ['topicId'] },
  { pattern: /^\/moments$/, action: 'moments_list' },
  { pattern: /^\/moments\/([^/]+)$/, action: 'moments_detail', ids: ['momentId'] },
  { pattern: /^\/categories$/, action: 'categories' },
  { pattern: /^\/books$/, action: 'books_list' },
  { pattern: /^\/search$/, action: 'search' },
  { pattern: /^\/share\/cards$/, action: 'share_cards' },
];

function resolveRoute(url) {
  for (const route of ROUTES) {
    const m = url.match(route.pattern);
    if (m) {
      const params = {};
      (route.ids || []).forEach((name, i) => {
        params[name] = decodeURIComponent(m[i + 1]);
      });
      let action = route.action;
      // /explore/{dimension} → explore_knowledge / explore_interest / ...
      if (action === 'explore_dim') action = `explore_${params.dimension}`;
      return { action, params };
    }
  }
  return null;
}

function request(url, method = 'GET', data = {}) {
  // 云函数分支：REST 路径翻译为 action 调用
  if (config.useCallFunction && !config.isMock) {
    const route = resolveRoute(url);
    if (!route) {
      return Promise.reject({ errMsg: `无可用 action 映射: ${url}`, data: { code: 40400, message: '接口不存在' } });
    }
    const params = { ...route.params, ...(data || {}) };
    // callAction 返回信封 { statusCode, data: { code, message, data } }；
    // 页面约定 res.data = 载荷（与 mock/WxMock 一致），此处解包，code≠0 视为失败
    return callAction(route.action, params).then((res) => {
      const body = res.data || {};
      if (res.statusCode === 200 && body.code === 0) {
        return { statusCode: 200, data: body.data };
      }
      return Promise.reject({ errMsg: body.message || '请求失败', data: body });
    });
  }

  const header = {
    'content-type': 'application/json',
    // 有其他content-type需求加点逻辑判断处理即可
  };
  // 获取token，有就丢进请求头
  const tokenString = wx.getStorageSync('access_token');
  if (tokenString) {
    header.Authorization = `Bearer ${tokenString}`;
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl + url,
      method,
      data,
      dataType: 'json', // 微信官方文档中介绍会对数据进行一次JSON.parse
      header,
      success(res) {
        setTimeout(() => {
          // HTTP状态码为200才视为成功
          if (res.code === 200) {
            resolve(res);
          } else {
            // wx.request的特性，只要有响应就会走success回调，所以在这里判断状态，非200的均视为请求失败
            reject(res);
          }
        }, delay);
      },
      fail(err) {
        setTimeout(() => {
          // 断网、服务器挂了都会fail回调，直接reject即可
          reject(err);
        }, delay);
      },
    });
  });
}

// 导出请求和服务地址
export default request;
