/**
 * wx-server-sdk 本地 stub（仅 tools/smoke-cloud.js 使用）。
 * 覆盖 NINA 用到的面：cloud.init / getWXContext / database().collection 链式查询。
 * 全部查询返回空数据，action 层应返回业务码而非抛异常。
 */
function makeQuery() {
  const q = {
    where() {
      return q;
    },
    orderBy() {
      return q;
    },
    field() {
      return q;
    },
    skip() {
      return q;
    },
    limit() {
      return q;
    },
    doc() {
      return q;
    },
    async get() {
      return { data: [] };
    },
    async count() {
      return { total: 0 };
    },
    async set() {
      return {};
    },
    async update() {
      return {};
    },
    async add() {
      return {};
    },
    async remove() {
      return {};
    },
  };
  return q;
}

module.exports = {
  DYNAMIC_CURRENT_ENV: Symbol('DYNAMIC_CURRENT_ENV'),
  CloudID(v) {
    return v;
  },
  init() {},
  getWXContext() {
    return { OPENID: 'smoke-openid', APPID: 'wx-stub', UNIONID: '' };
  },
  database() {
    return {
      collection() {
        return makeQuery();
      },
      // _.or([...]) / _.in(...) 等指令：任意调用返回占位对象
      command: new Proxy(
        {},
        { get: () => () => ({}) }
      ),
    };
  },
};
