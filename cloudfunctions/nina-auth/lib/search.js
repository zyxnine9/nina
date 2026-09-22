/**
 * 三段式语义搜索（云开发库不支持向量）：
 * ① LLM 查询重写（q → keywords/topics）
 * ② db.RegExp 多关键词召回 top40（text/comment/searchKw）
 * ③ LLM rerank 归一化 score，取 top10；LLM 失败时降级为纯关键词（命中计数归一化）
 */
const db = require('./db');
const { llmChatJson } = require('./llm');

const RECALL_LIMIT = 40;
const FINAL_LIMIT = 10;

function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** ① 查询重写 */
async function rewriteQuery(q) {
  try {
    const { json } = await llmChatJson([
      {
        role: 'system',
        content:
          '把用户的模糊查询改写为可用于关键词检索的 2-5 个关键词（同义改写、拆解意图），并给出 0-3 个可能的主题词。输出 JSON：{"keywords":["..."],"topics":["..."],"rewrittenQuery":"..."}',
      },
      { role: 'user', content: q },
    ]);
    const keywords = (json.keywords || []).filter(Boolean).map(String);
    return {
      keywords: keywords.length ? keywords : [q],
      topics: (json.topics || []).filter(Boolean),
      rewrittenQuery: json.rewrittenQuery || q,
      usedLlm: true,
    };
  } catch (e) {
    return { keywords: [q], topics: [], rewrittenQuery: q, usedLlm: false };
  }
}

/** ② 召回：多关键词 OR 正则（单条 alternation 正则）+ topics */
async function recall(userId, { keywords, topics }, { categoryId } = {}) {
  const terms = [...new Set([...keywords, ...topics])].filter(Boolean).slice(0, 6);
  if (!terms.length) return [];
  const regexp = db.db().RegExp({ regexp: terms.map(escapeReg).join('|'), options: 'i' });
  const _ = db.db().command;
  // userId 必须进入每个 OR 分支，保证用户隔离
  const branches = [
    { userId, text: regexp },
    { userId, comment: regexp },
    { userId, searchKw: regexp },
  ];
  const where = categoryId ? branches.map((b) => ({ ...b, categoryId })) : branches;
  const res = await db.col('moments').where(_.or(where)).orderBy('createdAt', 'desc').limit(RECALL_LIMIT).get();
  return res.data || [];
}

/** ③ rerank（LLM 失败降级为关键词命中计数） */
async function rerank(q, rows) {
  if (!rows.length) return [];
  try {
    const list = rows
      .map((m, i) => `${i}: 「${(m.text || '').slice(0, 80)}」${m.comment ? `（评：${m.comment.slice(0, 50)}）` : ''}`)
      .join('\n');
    const { json } = await llmChatJson([
      {
        role: 'system',
        content:
          '你是搜索相关性判官。对候选项按与查询的语义相关度打分（0-1，保留两位小数）。输出 JSON：{"scores":[{"i":0,"score":0.87}]}，只输出有意义的结果。',
      },
      { role: 'user', content: `查询：${q}\n\n候选：\n${list}` },
    ]);
    const scoreMap = new Map((json.scores || []).map((s) => [Number(s.i), Number(s.score) || 0]));
    return rows
      .map((m, i) => ({ m, score: scoreMap.get(i) || 0 }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, FINAL_LIMIT);
  } catch (e) {
    // 降级：关键词命中计数归一化
    const norm = (s) => String(s || '').toLowerCase();
    const scored = rows.map((m) => {
      const hay = `${norm(m.text)} ${norm(m.comment)} ${norm(m.searchKw)}`;
      const hits = String(q).toLowerCase().split(/\s+/).filter((k) => k && hay.includes(norm(k))).length;
      return { m, score: Math.min(1, hits / 3) };
    });
    return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, FINAL_LIMIT);
  }
}

/**
 * 超级搜索主入口。scope=book 时搜书单（标题/作者关键词匹配）。
 */
async function searchMoments(userId, { q, scope = 'moment', categoryId } = {}) {
  if (!q || !String(q).trim()) {
    return { nextCursor: null, queryUnderstanding: { rewrittenQuery: '', topics: [] }, items: [] };
  }
  const understanding = await rewriteQuery(String(q).trim());

  if (scope === 'book') {
    // 本地过滤用原生 RegExp（db.RegExp 只用于查询条件）
    const regexp = new RegExp(understanding.keywords.map(escapeReg).join('|'), 'i');
    const res = await db
      .col('books')
      .where({ userId })
      .limit(RECALL_LIMIT)
      .get();
    const items = (res.data || [])
      .filter((b) => regexp.test(`${b.title || ''}${b.author || ''}`))
      .slice(0, FINAL_LIMIT)
      .map((b) => ({ bookId: b.bookId, title: b.title, author: b.author, cover: b.cover, momentCount: b.momentCount || 0 }));
    return { nextCursor: null, queryUnderstanding: understanding, items };
  }

  const rows = await recall(userId, understanding, { categoryId });
  const ranked = await rerank(q, rows);
  return {
    nextCursor: null,
    queryUnderstanding: understanding,
    items: ranked.map(({ m, score }) => ({
      momentId: m._id,
      type: m.type,
      text: m.text,
      comment: m.comment,
      book: m.book,
      chapterTitle: m.chapterTitle,
      createdAt: m.createdAt,
      score,
    })),
  };
}

module.exports = { searchMoments, rewriteQuery, recall, rerank };
