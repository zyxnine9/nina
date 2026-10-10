/**
 * LLM 分析管道：10 个 step（aggregate→tags→headline→interest→knowledge→thinking→long_term→persona→unknown→topics）。
 * - analyses 文档存 steps 断点，每个 analysis_step 调用推进一个 step（含 1-2 次 LLM 调用），可单独重跑
 * - 证据锚定：LLM 只输出原文片段 quotes，服务端回查 moments 回填 momentIds（防幻觉）
 * - 输入压缩：每书抽样 8-10 条划线 + 全部评论，语料 ≤ LLM_CORPUS_MAX_CHARS
 */
const db = require('./db');
const { llmChatJson } = require('./llm');
const { getAnalysisDoc, saveAnalysis, nextStep, refreshProgress, anchorQuotes, STEP_ORDER } = require('./exploreUtils');
const { WereadClient } = require('./weread');
const { getUserKey } = require('./user');
const { LLM_CORPUS_MAX_CHARS } = require('../config');

const norm = (s) => String(s || '').replace(/\s+/g, '');

async function loadUserMoments(userId) {
  return db.fetchAll({
    name: 'moments',
    where: { userId },
    fields: { text: true, comment: true, bookId: true, type: true, createdAt: true, book: true, categoryId: true },
    max: 3000,
  });
}

/** 构建压缩语料：每书抽样划线 + 全部评论 */
function buildCorpus(moments, books, maxChars) {
  const bookMap = new Map(books.map((b) => [b.bookId, b]));
  const byBook = new Map();
  for (const m of moments) {
    if (!byBook.has(m.bookId)) byBook.set(m.bookId, { highlights: [], comments: [] });
    const g = byBook.get(m.bookId);
    if (m.type === 'highlight') g.highlights.push(m);
    else g.comments.push(m);
  }
  let corpus = '';
  const parts = [];
  for (const [bookId, g] of byBook) {
    const book = bookMap.get(bookId) || (moments.find((m) => m.bookId === bookId) || {}).book || {};
    if (!book.title) continue;
    const lines = [`《${book.title}》${book.author ? `（${book.author}）` : ''}`];
    // 划线均匀抽样最多 10 条
    const hs = g.highlights;
    const stride = Math.max(1, Math.ceil(hs.length / 10));
    for (let i = 0; i < hs.length && lines.length <= 11; i += stride) {
      const t = norm(hs[i].text).slice(0, 120);
      if (t) lines.push(`- 「${t}」`);
    }
    for (const c of g.comments.slice(0, 20)) {
      const t = norm(c.comment || c.text).slice(0, 150);
      if (t) lines.push(`- 我评：${t}`);
    }
    parts.push(lines.join('\n'));
  }
  for (const p of parts) {
    if (corpus.length + p.length > maxChars) break;
    corpus += (corpus ? '\n\n' : '') + p;
  }
  return corpus;
}

function yearOf(ts) {
  return ts ? new Date(ts * 1000).getFullYear() : 0;
}

function countByYear(momentIds, moments) {
  // Map 需 [key, value] 对：直接传文档数组会导致 values() 全为 undefined
  const map = new Map(moments.filter((m) => momentIds.includes(m._id)).map((m) => [m._id, m]));
  const byYear = new Map();
  for (const m of map.values()) {
    const y = yearOf(m.createdAt);
    if (!y) continue;
    byYear.set(y, (byYear.get(y) || 0) + 1);
  }
  return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year, count }));
}

const STEP_IMPL = {
  /** 聚合统计 + 压缩语料（无 LLM） */
  async aggregate({ userId }) {
    const [moments, books, readStats] = await Promise.all([
      loadUserMoments(userId),
      db.fetchAll({ name: 'books', where: { userId }, fields: { bookId: true, title: true, author: true }, max: 1000 }),
      db.getDoc('read_stats', `${userId}_overall`),
    ]);
    const highlightCount = moments.filter((m) => m.type === 'highlight').length;
    const years = moments.map((m) => yearOf(m.createdAt)).filter(Boolean);
    const detail = (readStats && readStats.detail) || {};
    return {
      stats: {
        bookCount: books.length,
        momentCount: moments.length,
        highlightCount,
        reviewCount: moments.length - highlightCount,
        firstYear: years.length ? Math.min(...years) : 0,
        readDays: detail.readDays || 0,
        totalReadTime: detail.totalReadTime || 0,
      },
      preferCategory: (detail.preferCategory || []).slice(0, 10),
      preferTime: detail.preferTime || [],
      preferTimeWord: detail.preferTimeWord || '',
      corpus: buildCorpus(moments, books, LLM_CORPUS_MAX_CHARS),
    };
  },

  /** 身份标签（渐进式揭示的 identity_tags） */
  async tags({ userId, analysis }) {
    const moments = await loadUserMoments(userId);
    const { json } = await llmChatJson([
      {
        role: 'system',
        content:
          '基于用户的阅读划线与评论语料，生成 3-5 个"身份型标签"（如：温和的怀疑者、方法论收藏家）。每个标签给出：name（4-8 字的身份型称呼）、summary（50-80 字解释，第二人称，推测语气）、headline（15-25 字的第二人称短句，把这个标签的读法凝成一句有画面感的话，禁止空洞口号，如"你用阅读整理不确定，而不是逃离它。"）、points（2-4 个支撑该判断的依据，每项 {"title":"4-8 字小标题，如【偏爱长期视角】","text":"30-60 字解释，第二人称，基于语料中的具体观察，不要复述 title"}）、reasoning（AI 从语料看到的规律）、quotes（4-8 条支撑该标签的【原文片段】，必须逐字摘自语料，每条 15-40 字）。输出 JSON：{"tags":[{name,summary,headline,points:[{title,text}],reasoning,quotes:[]}]}`',
      },
      { role: 'user', content: `阅读语料：\n${analysis.steps.aggregate.result.corpus}` },
    ]);
    const oldTags = await db.col('tags').where({ userId }).get();
    for (const t of oldTags.data || []) {
      await db.col('tags').doc(t._id).remove().catch(() => {});
    }
    const tags = [];
    let i = 0;
    for (const t of (json.tags || []).slice(0, 5)) {
      const momentIds = anchorQuotes(t.quotes, moments);
      if (momentIds.length < 3) continue; // 锚定不到足够证据的标签丢弃
      const bookIds = [...new Set(moments.filter((m) => momentIds.includes(m._id)).map((m) => m.bookId))];
      const tagId = `t_${String(++i).padStart(2, '0')}`;
      const doc = {
        _id: `${userId}_${tagId}`,
        userId,
        tagId,
        name: t.name,
        summary: t.summary || '',
        headline: typeof t.headline === 'string' ? t.headline.trim().slice(0, 40) : '',
        points: Array.isArray(t.points)
          ? t.points
              .filter((p) => p && p.title && p.text)
              .slice(0, 4)
              .map((p) => ({ title: String(p.title).slice(0, 12), text: String(p.text).slice(0, 120) }))
          : [],
        reasoning: t.reasoning || '',
        speculative: true, // 恒为 true：推测而非定义
        feedback: null,
        momentIds,
        bookIds,
        highlightCount: moments.filter((m) => momentIds.includes(m._id) && m.type === 'highlight').length,
        reviewCount: moments.filter((m) => momentIds.includes(m._id) && m.type === 'review').length,
        firstSeenAt: Math.min(...moments.filter((m) => momentIds.includes(m._id)).map((m) => m.createdAt || 0)),
      };
      await db.upsertDoc('tags', doc._id, doc);
      tags.push({ tagId, name: t.name, evidenceCount: momentIds.length });
    }
    return { tags };
  },

  /** 一句话洞察（发现页 headline） */
  async headline({ analysis }) {
    const { json } = await llmChatJson([
      {
        role: 'system',
        content:
          '基于用户的阅读语料，写一句让用户"心头一动"的洞察（30-50 字，第二人称，具体不空泛，如"你读了很多不同的书，但你似乎一直在寻找同一个答案"）。输出 JSON：{"headline":"..."}',
      },
      { role: 'user', content: `阅读语料：\n${analysis.steps.aggregate.result.corpus}` },
    ]);
    return { text: json.headline || '', generateAt: db.now() };
  },

  /** 兴趣结构：语义聚合（跨书反复出现是关键信号） */
  async interest({ userId, analysis }) {
    const moments = await loadUserMoments(userId);
    const { json } = await llmChatJson([
      {
        role: 'system',
        content:
          '对语料做主题聚类，找出用户真正反复回到的兴趣主题（3-6 个，注意跨书出现的主题才是兴趣）。每个主题：name（2-6 字）、quotes（3-6 条原文片段，逐字摘自语料）。输出 JSON：{"summary":"40字总结","items":[{name,quotes:[]}]}`',
      },
      { role: 'user', content: `阅读语料：\n${analysis.steps.aggregate.result.corpus}` },
    ]);
    const items = [];
    let i = 0;
    for (const it of json.items || []) {
      const momentIds = anchorQuotes(it.quotes, moments);
      if (momentIds.length < 2) continue;
      const bookIds = [...new Set(moments.filter((m) => momentIds.includes(m._id)).map((m) => m.bookId))];
      items.push({ id: `i_${++i}`, name: it.name, momentIds, bookCount: bookIds.length, momentCount: momentIds.length, spreadBooks: bookIds.length });
    }
    return { summary: json.summary || '', items };
  },

  /** 知识结构：/readdata/detail 的 preferCategory + 书籍分类归并 */
  async knowledge({ userId, analysis }) {
    const agg = analysis.steps.aggregate.result;
    const books = await db.fetchAll({
      name: 'books',
      where: { userId },
      fields: { bookId: true, category: true, readingTime: true },
      max: 1000,
    });
    const moments = await loadUserMoments(userId);

    // 按书籍一级分类聚合阅读时长与书数
    const grouped = new Map();
    for (const b of books) {
      const first = String(b.category || '').split('-')[0].trim() || '其他';
      const g = grouped.get(first) || { name: first, readingTime: 0, bookCount: 0, sub: new Map() };
      grouped.set(first, g); // ⚠️ 必须写回：曾漏掉导致 knowledge 恒为 0 items
      g.readingTime += b.readingTime || 0;
      g.bookCount += 1;
      const sub = String(b.category || '').split('-')[1];
      if (sub) g.sub.set(sub, (g.sub.get(sub) || 0) + 1);
    }
    // preferCategory 的阅读时长更准，用它覆盖
    for (const p of agg.preferCategory || []) {
      const first = String(p.parentCategoryTitle || p.categoryTitle || '').trim();
      if (grouped.has(first)) grouped.get(first).readingTime = p.readingTime || grouped.get(first).readingTime;
    }
    let summary = '';
    try {
      const desc = [...grouped.entries()].sort((a, b) => b[1].readingTime - a[1].readingTime).map(([k, v]) => `${k}(${Math.round(v.readingTime / 3600)}h)`).join('、');
      const { json } = await llmChatJson([
        { role: 'system', content: '用一句 30 字以内的话概括用户的知识结构构成。输出 JSON：{"summary":"..."}' },
        { role: 'user', content: `分类阅读时长分布：${desc}` },
      ]);
      summary = json.summary || '';
    } catch (e) {
      /* LLM 失败时 summary 留空 */
    }

    const items = [...grouped.entries()]
      .sort((a, b) => b[1].readingTime - a[1].readingTime)
      .map(([name, g], idx) => ({
        id: `k_${idx + 1}`,
        name,
        level: idx === 0 ? 'core' : idx < 3 ? 'sub' : 'related',
        readingTime: g.readingTime,
        bookCount: g.bookCount,
        momentCount: 0, // 下方按书分类归属覆盖
        children: [...g.sub.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([sname, c]) => ({ id: `k_${idx + 1}_${sname}`, name: sname, bookCount: c })),
      }));
    // momentCount 按书分类归属
    const bookCat = new Map(books.map((b) => [b.bookId, String(b.category || '').split('-')[0].trim() || '其他']));
    for (const item of items) {
      item.momentCount = moments.filter((m) => bookCat.get(m.bookId) === item.name).length;
    }
    return { summary, items };
  },

  /** 思维方式：评论风格分析 */
  async thinking({ userId, analysis }) {
    const moments = await loadUserMoments(userId);
    const comments = moments.filter((m) => m.comment || m.type === 'review');
    const sample = comments
      .slice(0, 60)
      .map((m) => `原文：「${norm(m.abstract || m.text).slice(0, 60)}」→ 我评：${norm(m.comment || m.text).slice(0, 100)}`)
      .join('\n');
    const { json } = await llmChatJson([
      {
        role: 'system',
        content:
          '分析用户在划线下写评论的方式，总结 2-4 种"思维方式"（如：例证式思维、质疑式思维、联系式思维）。每项：name（4-6 字）、description（30 字，具体到行为）、quotes（2-4 条能体现该风格的评论原文，逐字摘自语料）。输出 JSON：{"summary":"30字总结","items":[{name,description,quotes:[]}]}`',
      },
      { role: 'user', content: `评论样本：\n${sample || '（无评论）'}` },
    ]);
    const items = [];
    let i = 0;
    for (const it of json.items || []) {
      const momentIds = anchorQuotes(it.quotes, moments);
      items.push({ id: `th_${++i}`, name: it.name, description: it.description || '', momentIds, momentCount: momentIds.length });
    }
    return { summary: json.summary || '', items };
  },

  /** 长期关注：按年聚合 + LLM 归纳主题 */
  async long_term({ userId, analysis }) {
    const moments = await loadUserMoments(userId);
    const { json } = await llmChatJson([
      {
        role: 'system',
        content:
          '语料中的每本书后可结合时间线索，找出用户长期（跨年份）反复关注的 2-4 个主题。每项：name（2-6 字）、quotes（3-5 条原文片段，逐字摘自语料）。输出 JSON：{"summary":"30字总结","items":[{name,quotes:[]}]}`',
      },
      { role: 'user', content: `阅读语料：\n${analysis.steps.aggregate.result.corpus}` },
    ]);
    const items = [];
    let i = 0;
    for (const it of json.items || []) {
      const momentIds = anchorQuotes(it.quotes, moments);
      if (momentIds.length < 2) continue;
      const hit = moments.filter((m) => momentIds.includes(m._id));
      const years = [...new Set(hit.map((m) => yearOf(m.createdAt)).filter(Boolean))];
      const firstSeenAt = Math.min(...hit.map((m) => m.createdAt || Date.now() / 1000));
      items.push({
        id: `lt_${++i}`,
        name: it.name,
        momentIds,
        spanYears: years.length,
        firstSeenAt,
        trend: { byYear: countByYear(momentIds, moments) },
      });
    }
    return { summary: json.summary || '', items };
  },

  /** 阅读人格：preferTime 24h 分布 + 行为统计（⚠️ 上游数组从 6 点开始：index0=6点，依次到次日5点） */
  async persona({ userId, analysis }) {
    const agg = analysis.steps.aggregate.result;
    const preferTime = agg.preferTime || [];
    const total = preferTime.reduce((s, v) => s + (v || 0), 0) || 1;
    const hourOf = (idx) => (6 + idx) % 24;
    let peakHour = 0;
    let peakVal = -1;
    preferTime.forEach((v, idx) => {
      if ((v || 0) > peakVal) {
        peakVal = v || 0;
        peakHour = hourOf(idx);
      }
    });
    const isNight = (idx) => {
      const h = hourOf(idx);
      return h >= 22 || h < 6;
    };
    const nightRatio = preferTime.reduce((s, v, idx) => (isNight(idx) ? s + (v || 0) : s), 0) / total;
    const items = [
      {
        id: 'p_time',
        name: nightRatio > 0.35 ? '夜间沉浸型' : peakHour < 11 ? '清晨型' : '日间稳定型',
        description: `${Math.round(nightRatio * 100)}% 的阅读发生在 22 点-6 点，峰值在 ${peakHour} 点`,
        stats: { peakHour, nightRatio: Math.round(nightRatio * 100) / 100, readDays: agg.stats.readDays, totalReadTime: agg.stats.totalReadTime },
      },
    ];
    let summary = agg.preferTimeWord || '';
    try {
      const { json } = await llmChatJson([
        { role: 'system', content: '结合阅读时间分布与阅读量，给用户的阅读人格起一个 4-8 字的名字并用 30 字描述。输出 JSON：{"summary":"..."}' },
        { role: 'user', content: `峰值小时：${peakHour} 点；夜间占比：${Math.round(nightRatio * 100)}%；累计阅读 ${agg.stats.readDays} 天，共 ${Math.round(agg.stats.totalReadTime / 3600)} 小时` },
      ]);
      summary = json.summary || summary;
    } catch (e) {
      /* 降级用 preferTimeWord */
    }
    return { summary, items };
  },

  /** 未知领域：LLM 推断盲区 + 上游推荐补全 entryBooks */
  async unknown({ userId, analysis }) {
    const moments = await loadUserMoments(userId);
    const { json } = await llmChatJson([
      {
        role: 'system',
        content:
          '基于语料推断用户的知识盲区与潜在兴趣（3-5 个）：与用户关注点相邻、但语料中从未出现或极少出现的领域。每项：name（2-6 字）、level（potential=潜在兴趣 | blind=盲区）、reason（50 字，引用用户的已有线索）、quotes（1-3 条相关原文片段，逐字摘自语料，可为空数组）。输出 JSON：{"summary":"30字总结","items":[{name,level,reason,quotes:[]}]}`',
      },
      { role: 'user', content: `阅读语料：\n${analysis.steps.aggregate.result.corpus}` },
    ]);
    // entryBooks：调上游推荐补全
    let recBooks = [];
    try {
      const key = await getUserKey(await db.getDoc('users', userId));
      if (key) {
        const client = new WereadClient(key);
        const rec = await client.bookRecommend(12).catch(() => null);
        recBooks = ((rec && rec.books) || []).map((b) => ({ bookId: b.bookId, title: b.title, author: b.author, cover: b.cover }));
      }
    } catch (e) {
      /* 上游失败 entryBooks 留空 */
    }
    const items = [];
    let i = 0;
    for (const it of json.items || []) {
      const momentIds = anchorQuotes(it.quotes, moments);
      const start = (i * 3) % Math.max(1, recBooks.length);
      items.push({
        id: `u_${++i}`,
        name: it.name,
        level: it.level === 'blind' ? 'blind' : 'potential',
        reason: it.reason || '',
        momentIds,
        entryBooks: recBooks.length ? recBooks.slice(start, start + 3) : [],
      });
    }
    return { summary: json.summary || '', items };
  },

  /** 知识专题：跨书主题聚合 → topics 集合 */
  async topics({ userId, analysis }) {
    const moments = await loadUserMoments(userId);
    const { json } = await llmChatJson([
      {
        role: 'system',
        content:
          '从语料中归纳 4-8 个用户反复触碰的"知识专题"（如：关于自由、意义感）。每个：name（3-8 字，可用"关于XX"句式）、summary（40 字，这个主题在用户阅读里的面貌）、quotes（4-8 条原文片段，逐字摘自语料，尽量跨书）、exploreNext（1-2 个继续探索方向，{type:"question",text:"一个问题"}）。输出 JSON：{"topics":[{name,summary,quotes:[],exploreNext:[]}]}`',
      },
      { role: 'user', content: `阅读语料：\n${analysis.steps.aggregate.result.corpus}` },
    ]);
    const oldTopics = await db.col('topics').where({ userId }).get();
    for (const t of oldTopics.data || []) {
      await db.col('topics').doc(t._id).remove().catch(() => {});
    }
    const topics = [];
    let i = 0;
    for (const t of json.topics || []) {
      const momentIds = anchorQuotes(t.quotes, moments);
      if (momentIds.length < 3) continue;
      const bookIds = [...new Set(moments.filter((m) => momentIds.includes(m._id)).map((m) => m.bookId))];
      const topicId = `topic_${String(++i).padStart(2, '0')}`;
      const doc = {
        _id: `${userId}_${topicId}`,
        userId,
        topicId,
        name: t.name,
        summary: t.summary || '',
        aiSummary: '',
        momentIds,
        bookIds,
        momentCount: momentIds.length,
        bookCount: bookIds.length,
        relatedTopicIds: [],
        evolution: [],
        exploreNext: (t.exploreNext || []).slice(0, 2),
      };
      await db.upsertDoc('topics', doc._id, doc);
      topics.push({ topicId, name: t.name, momentCount: momentIds.length });
    }
    // 回填 moments.topicIds 供过滤
    for (const t of topics) {
      const doc = await db.getDoc('topics', `${userId}_${t.topicId}`);
      for (const mid of doc.momentIds) {
        await db.col('moments').doc(mid).update({ data: { topicIds: db.db().command.push([t.topicId]) } }).catch(() => {});
      }
    }
    return { topics };
  },
};

/**
 * 推进一个 step（由 analysis_step 调用）。单 step 含 1-2 次 LLM 调用，
 * 云函数超时 60s / LLM 超时 45s 内单步必完成。
 */
async function advance(userId) {
  let analysis = await getAnalysisDoc(userId);
  if (!analysis) throw new Error('analyses doc 不存在，请先 analysis_run');
  if (analysis.status === 'done') return analysis;
  if (analysis.status === 'failed') return analysis;

  const key = nextStep(analysis);
  if (!key) {
    analysis.status = 'done';
    analysis.progress = 100;
    analysis.finishedAt = db.now();
    await saveAnalysis(analysis);
    return analysis;
  }
  analysis.currentStep = key;
  await saveAnalysis(analysis);

  const result = await STEP_IMPL[key]({ userId, analysis });
  analysis = await getAnalysisDoc(userId); // 重读，避免长时间 LLM 调用期间的脏写
  analysis.steps[key] = { status: 'done', result, at: db.now() };
  refreshProgress(analysis);
  if (!nextStep(analysis)) {
    analysis.status = 'done';
    analysis.finishedAt = db.now();
  }
  await saveAnalysis(analysis);
  return analysis;
}

module.exports = { advance, STEP_ORDER, buildCorpus, loadUserMoments };
