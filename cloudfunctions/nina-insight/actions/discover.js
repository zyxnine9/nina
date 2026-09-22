/**
 * 发现页 actions：discover_summary / tags_list / tags_detail / tags_feedback。
 * 数据全部来自 tags 集合（analyzer tags step 写入），未完成分析时 50200。
 */
const db = require('../lib/db');
const { BizError } = require('../lib/respond');
const { ERR } = require('../config');
const { loadMoments } = require('../lib/exploreUtils');
const { momentItem } = require('../lib/momentItem');

function requireTags(userId) {
  // 存在 tags 文档 = tags step 已完成
  return db.col('tags').where({ userId }).limit(1).get();
}

async function summary({ userId }) {
  const tagsRes = await requireTags(userId);
  if (!tagsRes.data.length) {
    throw new BizError(ERR.ANALYSIS_NOT_READY, 'AI 分析尚未完成，请先完成分析');
  }
  const tags = tagsRes.data.sort((a, b) => b.momentIds.length - a.momentIds.length);
  const analysis = await db.getDoc('analyses', userId);
  const headline = (analysis && analysis.steps.headline && analysis.steps.headline.result) || {};
  const primary = tags[0];

  return {
    headline: { text: headline.text || '', generateAt: headline.generateAt || 0 },
    primaryTag: primary
      ? { tagId: primary.tagId, name: primary.name, reason: primary.summary || '', evidenceCount: primary.momentIds.length }
      : null,
    tags: tags.slice(1, 3).map((t) => ({ tagId: t.tagId, name: t.name })),
    newInsight: null,
  };
}

async function tagsList({ userId, params }) {
  const page = await db.paginate({
    name: 'tags',
    where: {},
    userId,
    orderBy: 'updatedAt',
    cursor: params.cursor,
    limit: params.limit,
    maxLimit: 50,
  });
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((t) => ({
      tagId: t.tagId,
      name: t.name,
      summary: t.summary,
      evidenceCount: t.momentIds.length,
      bookCount: (t.bookIds || []).length,
      momentCount: t.momentIds.length,
      feedback: t.feedback || null,
      speculative: true,
    })),
  };
}

async function tagsDetail({ userId, params }) {
  const tagId = params.tagId || params.id;
  if (!tagId) throw new BizError(ERR.BAD_PARAMS, '缺少 tagId');
  const tag = await db.getDoc('tags', `${userId}_${tagId}`);
  if (!tag) throw new BizError(ERR.NOT_FOUND, '标签不存在');

  const moments = await loadMoments(userId, tag.momentIds);
  const books = await db.fetchAll({ name: 'books', where: { userId }, fields: { bookId: true, title: true, author: true, cover: true, momentCount: true }, max: 1000 });
  const bookMap = new Map(books.map((b) => [b.bookId, b]));

  const tagBooks = (tag.bookIds || []).map((bookId) => {
    const b = bookMap.get(bookId) || {};
    return { bookId, title: b.title || '', author: b.author || '', cover: b.cover || '', momentCount: (b.momentCount || 0) };
  });

  // 长期趋势：证据瞬间按年聚合
  const byYear = new Map();
  for (const m of moments) {
    if (!m.createdAt) continue;
    const y = new Date(m.createdAt * 1000).getFullYear();
    byYear.set(y, (byYear.get(y) || 0) + 1);
  }
  const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]);

  // 相关主题：moment 交集
  const relatedTopics = [];
  const topicsRes = await db.col('topics').where({ userId }).limit(20).get();
  for (const t of topicsRes.data || []) {
    const overlap = (t.momentIds || []).filter((id) => tag.momentIds.includes(id)).length;
    if (overlap >= 3) relatedTopics.push({ topicId: t.topicId, name: t.name });
  }

  return {
    tagId: tag.tagId,
    name: tag.name,
    summary: tag.summary,
    reasoning: tag.reasoning,
    stats: {
      bookCount: (tag.bookIds || []).length,
      momentCount: tag.momentIds.length,
      highlightCount: tag.highlightCount || 0,
      reviewCount: tag.reviewCount || 0,
      firstSeenAt: tag.firstSeenAt || 0,
      longTerm: years.length > 1,
    },
    books: tagBooks,
    moments: moments.slice(0, 20).map((m) => ({
      ...momentItem(m),
      relevance: Math.round((1 / (1 + (tag.momentIds.length - tag.momentIds.indexOf(m._id)) * 0.1)) * 100) / 100,
    })),
    trend: { byYear: years.map(([year, count]) => ({ year, count })) },
    relatedTopics,
    feedback: tag.feedback || null,
  };
}

async function tagsFeedback({ userId, params }) {
  const tagId = params.tagId || params.id;
  const type = params.type;
  if (!tagId) throw new BizError(ERR.BAD_PARAMS, '缺少 tagId');
  if (!['like', 'somewhat', 'dislike'].includes(type)) {
    throw new BizError(ERR.BAD_PARAMS, 'type 必须是 like | somewhat | dislike');
  }
  const tag = await db.getDoc('tags', `${userId}_${tagId}`);
  if (!tag) throw new BizError(ERR.NOT_FOUND, '标签不存在');
  await db.col('tags').doc(tag._id).update({ data: { feedback: type } });
  return {};
}

module.exports = { summary, tagsList, tagsDetail, tagsFeedback };
