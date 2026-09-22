/**
 * 超级搜索 action：GET /search → search。
 */
const { searchMoments } = require('../lib/search');
const { BizError } = require('../lib/respond');
const { ERR } = require('../config');

async function search({ userId, params }) {
  const q = params.q;
  if (!q || !String(q).trim()) {
    throw new BizError(ERR.BAD_PARAMS, '请输入搜索内容');
  }
  return searchMoments(userId, {
    q: String(q),
    scope: params.scope === 'book' ? 'book' : 'moment',
    categoryId: params.categoryId,
  });
}

module.exports = { search };
