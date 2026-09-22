/**
 * 内容只读接口：moments_list / moments_detail / categories / books_list / topics_list / topics_detail。
 * 全列表强制分页（callFunction 回包 1MB 限制），userId 强制过滤。
 */
const db = require('../lib/db');
const { BizError } = require('../lib/respond');
const { ERR } = require('../config');
const { llmChat } = require('../lib/llm');
const { momentItem } = require('../lib/momentItem');

async function momentsList({ userId, params }) {
  const where = {};
  if (params.type) where.type = params.type === 'review' ? 'review' : 'highlight';
  if (params.bookId) where.bookId = params.bookId;
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.topicId) where.topicIds = params.topicId;

  const orderBy = params.sort === 'book' ? 'bookId' : 'createdAt';
  const page = await db.paginate({
    name: 'moments',
    where,
    userId,
    orderBy,
    cursor: params.cursor,
    limit: params.limit,
  });
  return { nextCursor: page.nextCursor, items: page.items.map(momentItem) };
}

async function momentsDetail({ userId, params }) {
  const momentId = params.momentId || params.id;
  if (!momentId) throw new BizError(ERR.BAD_PARAMS, '缺少 momentId');
  const doc = await db.getDoc('moments', momentId);
  if (!doc || doc.userId !== userId) throw new BizError(ERR.NOT_FOUND, '瞬间不存在');

  // 同书最近的瞬间作为 related（MVP 无向量，用同书近似）
  const related = await db.paginate({
    name: 'moments',
    where: { bookId: doc.bookId },
    userId,
    orderBy: 'createdAt',
    limit: 5,
  });

  const inTopics = [];
  if ((doc.topicIds || []).length) {
    for (const topicId of doc.topicIds) {
      const t = await db.getDoc('topics', `${userId}_${topicId}`);
      if (t) inTopics.push({ topicId, name: t.name });
    }
  }

  return {
    ...momentItem(doc),
    range: doc.range,
    source: { upstream: 'weread', rawId: String(doc._id).replace(`${userId}_`, '') },
    relatedMoments: related.items.filter((m) => m._id !== doc._id).slice(0, 4).map(momentItem),
    inTopics,
  };
}

async function categories({ userId, params }) {
  const page = await db.paginate({
    name: 'categories',
    where: {},
    userId,
    orderBy: 'momentCount',
    cursor: params.cursor,
    limit: params.limit || 100,
    maxLimit: 100,
  });
  return {
    items: page.items.map((c) => ({
      categoryId: c.categoryId,
      name: c.name,
      momentCount: c.momentCount,
      children: [],
    })),
  };
}

async function booksList({ userId, params }) {
  const where = {};
  // q：书名/作者模糊搜索
  if (params.q) {
    const reg = db.db().RegExp({ regexp: escapeReg(params.q), options: 'i' });
    where.title = reg;
  }
  const orderBy = params.sort === 'notes' ? 'momentCount' : 'lastReadAt';
  const page = await db.paginate({
    name: 'books',
    where,
    userId,
    orderBy,
    cursor: params.cursor,
    limit: params.limit,
  });
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((b) => ({
      bookId: b.bookId,
      title: b.title,
      author: b.author,
      cover: b.cover,
      category: b.category,
      momentCount: b.momentCount || 0,
      highlightCount: b.highlightCount || 0,
      reviewCount: b.reviewCount || 0,
      progress: b.progress || 0,
      readingTime: b.readingTime || 0,
      lastReadAt: b.lastReadAt || 0,
      finished: Boolean(b.finished),
      bookmarkCount: b.bookmarkCount || 0,
    })),
  };
}

function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function topicsList({ userId, params }) {
  const page = await db.paginate({
    name: 'topics',
    where: {},
    userId,
    orderBy: 'momentCount',
    cursor: params.cursor,
    limit: params.limit,
  });
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((t) => ({
      topicId: t.topicId,
      name: t.name,
      cover: t.cover || '',
      bookCount: (t.bookIds || []).length,
      momentCount: (t.momentIds || []).length,
      relatedTopicCount: (t.relatedTopicIds || []).length,
      summary: t.summary || '',
    })),
  };
}

/** 主题详情：aiSummary 懒生成（首次访问时用 LLM 补） */
async function topicsDetail({ userId, params }) {
  const topicId = params.topicId || params.id;
  if (!topicId) throw new BizError(ERR.BAD_PARAMS, '缺少 topicId');
  const topic = await db.getDoc('topics', `${userId}_${topicId}`);
  if (!topic) throw new BizError(ERR.NOT_FOUND, '主题不存在');

  // 懒生成 aiSummary
  if (!topic.aiSummary) {
    try {
      const moments = await loadMomentsByIds(userId, (topic.momentIds || []).slice(0, 30));
      const sample = moments
        .map((m) => `「${(m.text || '').slice(0, 80)}」${m.comment ? `（我的评论：${m.comment.slice(0, 60)}）` : ''}`)
        .join('\n');
      const res = await llmChat([
        {
          role: 'system',
          content:
            '你是阅读自我探索助手。基于用户在某个主题下反复划线/评论的原文片段，用第二人称写一段 80-150 字的解读，回答"你为什么反复关注这个问题？"。只输出正文。',
        },
        { role: 'user', content: `主题：${topic.name}\n\n原文片段：\n${sample}` },
      ]);
      topic.aiSummary = res.text;
      await db.col('topics').doc(topic._id).update({ data: { aiSummary: topic.aiSummary } });
    } catch (e) {
      topic.aiSummary = topic.summary || '';
    }
  }

  const books = await loadBooksByIds(userId, topic.bookIds || []);
  const moments = await loadMomentsByIds(userId, topic.momentIds || []);

  return {
    topicId: topic.topicId,
    name: topic.name,
    stats: { bookCount: books.length, momentCount: moments.length },
    books: books.map((b) => ({ bookId: b.bookId, title: b.title, cover: b.cover, momentCount: b.momentCount || 0 })),
    moments: moments.slice(0, 30).map(momentItem),
    aiSummary: topic.aiSummary,
    evolution: topic.evolution || [],
    exploreNext: topic.exploreNext || [],
  };
}

async function loadMomentsByIds(userId, ids) {
  const out = [];
  for (const id of ids) {
    const doc = await db.getDoc('moments', id);
    if (doc && doc.userId === userId) out.push(doc);
  }
  return out;
}

async function loadBooksByIds(userId, ids) {
  const out = [];
  for (const id of ids) {
    const doc = await db.getDoc('books', `${userId}_${id}`);
    if (doc) out.push(doc);
  }
  return out;
}

module.exports = { momentsList, momentsDetail, categories, booksList, topicsList, topicsDetail };
