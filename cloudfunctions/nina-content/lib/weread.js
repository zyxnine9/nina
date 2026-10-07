/**
 * 上游微信读书 Agent API 网关客户端。
 * 规范（docs/WeRead_API.md）：POST 网关、业务参数平铺 body 顶层、必带 skill_version；
 * Key 绑定用户身份，只在云函数内使用，绝不打印、绝不下发。
 */
const { WEREAD_GATEWAY, WEREAD_SKILL_VERSION, UPSTREAM_CONCURRENCY, HTTP_TIMEOUT_MS, HTTP_RETRIES, HTTP_BACKOFF_MS } = require('../config');
const { postJsonRetry } = require('./http');
const { BizError } = require('./respond');
const { ERR } = require('../config');

class WereadError extends Error {
  constructor(kind, message, detail) {
    super(message);
    this.kind = kind; // 'auth' | 'rate' | 'upstream'
    this.detail = detail;
  }
}

// 并发节流：所有上游调用共享一个信号量池（4 路在途），429 由 postJsonRetry 退避兜底
class Semaphore {
  constructor(limit) {
    this.limit = Math.max(1, limit);
    this.active = 0;
    this.queue = [];
  }
  acquire() {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }
  release() {
    const next = this.queue.shift();
    if (next) next();
    else this.active -= 1;
  }
}
const upstreamPool = new Semaphore(UPSTREAM_CONCURRENCY);

class WereadClient {
  constructor(key) {
    if (!key) throw new BizError(ERR.UPSTREAM, '用户未绑定微信读书 KEY');
    this.key = key;
  }

  /** 调网关：并发池限流，自动重试（429/5xx/网络），401/403 → auth 错误 */
  async call(apiName, params = {}) {
    try {
      await upstreamPool.acquire();
      try {
        const body = { api_name: apiName, ...params, skill_version: WEREAD_SKILL_VERSION };
        const res = await postJsonRetry({
          url: WEREAD_GATEWAY,
          headers: { Authorization: `Bearer ${this.key}` },
          body,
          timeout: HTTP_TIMEOUT_MS,
          retries: HTTP_RETRIES,
          backoffMs: HTTP_BACKOFF_MS,
        });
        if (res.status === 401 || res.status === 403) {
          throw new WereadError('auth', '微信读书 KEY 无效或已过期', res.raw);
        }
        if (res.status < 200 || res.status >= 300) {
          throw new WereadError('upstream', `上游接口错误 http ${res.status}`, res.raw);
        }
        const data = res.data;
        if (!data) throw new WereadError('upstream', '上游回包不是合法 JSON', res.raw);
        if (typeof data.errcode === 'number' && data.errcode !== 0) {
          if (data.errcode === 401 || data.errcode === 403 || /key|auth/i.test(String(data.errmsg || ''))) {
            throw new WereadError('auth', '微信读书 KEY 无效或已过期', data.errmsg);
          }
          throw new WereadError('upstream', `上游业务错误 errcode=${data.errcode}`, data.errmsg);
        }
        return data;
      } finally {
        upstreamPool.release();
      }
    } catch (e) {
      if (e instanceof WereadError) throw new BizError(ERR.UPSTREAM, e.message);
      if (e && e.status === 429) throw new BizError(ERR.TOO_MANY, '请求过于频繁，请稍后重试');
      throw new BizError(ERR.UPSTREAM, '上游微信读书接口错误');
    }
  }

  /** 书架全量（无增量参数） */
  shelfSync() {
    return this.call('/shelf/sync', {});
  }

  /** 有笔记的书单，lastSort 游标翻页，返回全部 books */
  async notebooksAll() {
    const all = [];
    let lastSort;
    let totalBookCount = 0;
    for (let i = 0; i < 50; i++) {
      const params = { count: 100 };
      if (lastSort !== undefined) params.lastSort = lastSort;
      const res = await this.call('/user/notebooks', params);
      totalBookCount = res.totalBookCount || totalBookCount;
      const books = res.books || [];
      all.push(...books);
      if (!res.hasMore || !books.length) break;
      const last = books[books.length - 1];
      if (last.sort === undefined || last.sort === lastSort) break;
      lastSort = last.sort;
    }
    return { books: all, totalBookCount };
  }

  /** 某本书全部划线（一次性返回，上游不支持 count/limit） */
  bookmarkList(bookId) {
    return this.call('/book/bookmarklist', { bookId });
  }

  /** 某本书我的想法：单页（不翻页），返回前 count 条 reviews（展平 review 字段） */
  async reviewListPage(bookId, count = 3) {
    const res = await this.call('/review/list/mine', { bookid: bookId, synckey: 0, count });
    return (res.reviews || []).map((r) => r.review || r);
  }

  /** 某本书我的想法，synckey 游标翻页，返回全部 reviews（展平 review 字段） */
  async reviewListMineAll(bookId) {
    const all = [];
    let synckey = 0;
    for (let i = 0; i < 100; i++) {
      const res = await this.call('/review/list/mine', { bookid: bookId, synckey, count: 100 });
      const reviews = (res.reviews || []).map((r) => r.review || r);
      all.push(...reviews);
      if (!res.hasMore || !(res.reviews || []).length) break;
      if (res.synckey === synckey) break;
      synckey = res.synckey;
    }
    return all;
  }

  /** 阅读进度 */
  getProgress(bookId) {
    return this.call('/book/getprogress', { bookId });
  }

  /** 宏观阅读统计 */
  readDataDetail(mode = 'overall') {
    return this.call('/readdata/detail', { mode });
  }

  /** 个性化推荐（unknown 维度入门书） */
  bookRecommend(count = 12) {
    return this.call('/book/recommend', { count });
  }

  /** 相似书籍（unknown 维度入门书） */
  bookSimilar(bookId, count = 12) {
    return this.call('/book/similar', { bookId, count });
  }
}

module.exports = { WereadClient, WereadError };
