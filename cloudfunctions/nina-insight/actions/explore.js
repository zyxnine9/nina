/**
 * 探索页 actions：explore_overview + 六维（knowledge/interest/thinking/long_term/persona/unknown）+ explore_map。
 * 未完成的维度返回 50200。数据来自 analyses.steps 对应 result（analyzer 写入）。
 */
const db = require('../lib/db');
const { BizError } = require('../lib/respond');
const { ERR } = require('../config');
const { getAnalysisDoc, requireStepResult, loadMoments, saveAnalysis } = require('../lib/exploreUtils');
const { momentItem } = require('../lib/momentItem');
const { llmChatJson } = require('../lib/llm');

const DIMENSIONS = [
  { key: 'knowledge', action: 'knowledge', title: '知识结构', step: 'knowledge' },
  { key: 'interest', action: 'interest', title: '兴趣结构', step: 'interest' },
  { key: 'thinking', action: 'thinking', title: '思维方式', step: 'thinking' },
  { key: 'long_term', action: 'longTerm', title: '长期关注', step: 'long_term' },
  { key: 'persona', action: 'persona', title: '阅读人格', step: 'persona' },
  { key: 'unknown', action: 'unknown', title: '未知领域', step: 'unknown' },
];

/** 六维详情公共包装：result + evidence（证据瞬间） */
async function dimensionResult(userId, stepKey, title) {
  const analysis = await getAnalysisDoc(userId);
  if (!analysis) {
    throw new BizError(ERR.ANALYSIS_NOT_READY, '尚未开始 AI 分析');
  }
  const result = requireStepResult(analysis, stepKey, title);
  const momentIds = (result.items || []).flatMap((it) => it.momentIds || []).slice(0, 20);
  const evidence = await loadMoments(userId, momentIds);
  return { dimension: stepKey, title, summary: result.summary || '', ...result, evidence: evidence.map(momentItem) };
}

async function overview({ userId }) {
  const analysis = await getAnalysisDoc(userId);
  if (!analysis) {
    throw new BizError(ERR.ANALYSIS_NOT_READY, '尚未开始 AI 分析');
  }
  const steps = analysis.steps || {};
  return {
    dimensions: DIMENSIONS.map((d) => {
      const step = steps[d.step];
      const done = Boolean(step && step.status === 'done');
      return {
        key: d.key,
        title: d.title,
        oneLine: done ? step.result.summary || '' : '',
        itemCount: done ? (step.result.items || []).length : 0,
        revealed: done,
      };
    }),
  };
}

async function knowledge(ctx) {
  return dimensionResult(ctx.userId, 'knowledge', '知识结构');
}
async function interest(ctx) {
  return dimensionResult(ctx.userId, 'interest', '兴趣结构');
}

/** 思维方式详情：核心判断 + basis + 逐动作的对话式证据组（原文—回应），主动评论不足时 forming=true */
async function thinking({ userId }) {
  const analysis = await getAnalysisDoc(userId);
  if (!analysis) {
    throw new BizError(ERR.ANALYSIS_NOT_READY, '尚未开始 AI 分析');
  }
  const result = requireStepResult(analysis, 'thinking', '思维方式');
  const agg = (analysis.steps.aggregate && analysis.steps.aggregate.result) || {};
  const stats = agg.stats || {};
  const items = [];
  for (const it of result.items || []) {
    const moments = await loadMoments(userId, (it.momentIds || []).slice(0, 8));
    const evidenceGroups = moments
      .filter((m) => m.comment)
      .slice(0, 4)
      .map((m) => ({
        sourceMomentId: m._id,
        sourceText: String(m.text || m.abstract || ''),
        userResponse: String(m.comment || ''),
        bookTitle: String((m.book && m.book.title) || ''),
        chapterTitle: String(m.chapterTitle || ''),
      }));
    items.push({
      id: it.id,
      name: it.name,
      description: it.description || '',
      momentCount: it.momentCount || (it.momentIds || []).length,
      evidenceGroups,
    });
  }
  const commentCount = stats.reviewCount || 0;
  return {
    dimension: 'thinking',
    title: '思维方式',
    summary: result.summary || '',
    basis: { commentCount, bookCount: stats.bookCount || 0 },
    forming: !items.length || commentCount < 3,
    items,
  };
}
async function longTerm(ctx) {
  return dimensionResult(ctx.userId, 'long_term', '长期关注');
}

const PERSONA_CACHE_VERSION = 1;

/** 行为证据池：behaviorEvidence 只能从这里逐字选取（防 LLM 编数据） */
function personaEvidencePool(stats, rhythm) {
  const pool = [];
  if (rhythm.nightRatio > 0) pool.push(`夜间阅读占 ${Math.round(rhythm.nightRatio * 100)}%`);
  if (rhythm.peakHour) pool.push(`阅读高峰在 ${rhythm.peakHour} 点`);
  if (stats.readDays) pool.push(`累计阅读 ${stats.readDays} 天`);
  if (stats.totalReadTime) pool.push(`累计阅读 ${Math.round(stats.totalReadTime / 3600)} 小时`);
  if (stats.bookCount) pool.push(`读过 ${stats.bookCount} 本书`);
  if (stats.reviewCount) pool.push(`写下 ${stats.reviewCount} 条评论`);
  if (stats.highlightCount) pool.push(`留下 ${stats.highlightCount} 条划线`);
  return pool;
}

/**
 * 人物原型（懒 LLM + 缓存）：analyses.steps.persona.details.archetype。
 * 人物优先取自用户读过的书；虚构人物 sourceTitle 必须命中书单，否则降级抽象原型。
 * 失败/超时返回 null（前端退化为行为节律展示），不缓存不抛。
 */
async function loadArchetype(userId, analysis, rhythm, stats) {
  const step = analysis.steps.persona || {};
  const cache = (step.details || {}).archetype;
  if (cache && cache.v === PERSONA_CACHE_VERSION && cache.archetype) return cache.archetype;

  const books = await db.fetchAll({ name: 'books', where: { userId }, fields: { title: true }, max: 200 });
  const titles = books.map((b) => String(b.title || '')).filter(Boolean).slice(0, 30);
  if (!titles.length) return null;
  const pool = personaEvidencePool(stats, rhythm);
  const prompt = [
    {
      role: 'system',
      content:
        '你是阅读人格画像助手。根据用户的阅读行为与书单，为用户挑一个"人物原型"：优先从书单里的书中选一个虚构人物或历史文化人物（kind="fictional_character"，sourceTitle 必须是书单中出现过的书名），没有合适人物时用抽象原型（kind="abstract"，如「夜航者」「漫游学者」，sourceTitle 留空）。约束：framing 为以"你的阅读让人联想到"起头的完整句（20-40 字）；不透露人物关键情节、关系转折或结局；不用感叹号；不用在世明星。traits 为 3-4 个用户与该人物的相似处，每项 name（4-8 字）、description（30-60 字，第二人称，推测语气）、behaviorEvidence（从证据池逐字挑 1-2 条，禁止改写或自造数字）。输出 JSON：{"archetype":{"kind":"fictional_character|abstract","name":"...","sourceTitle":"...","framing":"...","traits":[{"name":"...","description":"...","behaviorEvidence":["..."]}]}}',
    },
    {
      role: 'user',
      content: `书单（部分书名）：${titles.join('、')}\n行为画像：阅读高峰 ${rhythm.peakHour} 点，夜间占比 ${Math.round(rhythm.nightRatio * 100)}%，累计阅读 ${stats.readDays} 天共 ${Math.round((stats.totalReadTime || 0) / 3600)} 小时，读过 ${stats.bookCount} 本书，写下 ${stats.reviewCount || 0} 条评论。\n可选证据池（behaviorEvidence 只能从中逐字选取）：\n${pool.map((p) => `- ${p}`).join('\n')}`,
    },
  ];
  let archetype = null;
  try {
    const { json } = await withDeadline(llmChatJson(prompt), 13000);
    const a = (json && json.archetype) || {};
    if (a.name) {
      const kind = a.kind === 'fictional_character' ? 'fictional_character' : 'abstract';
      let sourceTitle = String(a.sourceTitle || '').slice(0, 40);
      if (kind === 'fictional_character' && !titles.includes(sourceTitle)) {
        sourceTitle = ''; // sourceTitle 不在书单 → 降级为抽象原型
      }
      archetype = {
        kind: sourceTitle ? 'fictional_character' : 'abstract',
        name: String(a.name).slice(0, 20),
        sourceTitle,
        portraitAsset: '',
        framing: String(a.framing || '').slice(0, 60),
        traits: (a.traits || [])
          .slice(0, 5)
          .map((t) => ({
            name: String(t.name || '').slice(0, 12),
            description: String(t.description || '').slice(0, 120),
            behaviorEvidence: (t.behaviorEvidence || []).filter((s) => pool.includes(String(s))).slice(0, 2),
          }))
          .filter((t) => t.name),
      };
      if (!archetype.traits.length) archetype = null;
    }
  } catch (e) {
    console.warn('[explore/persona] archetype LLM 失败，返回 null:', e && e.message);
    return null;
  }
  if (!archetype) return null;

  // 回写缓存：重读 analyses 且 status==='done' 才写
  try {
    const fresh = await getAnalysisDoc(userId);
    if (fresh && fresh.status === 'done' && fresh.steps && fresh.steps.persona) {
      const details = fresh.steps.persona.details || {};
      details.archetype = { v: PERSONA_CACHE_VERSION, generatedAt: db.now(), archetype };
      fresh.steps.persona.details = details;
      await saveAnalysis(fresh);
    }
  } catch (e) {
    console.warn('[explore/persona] archetype 缓存回写失败（不影响返回）:', e && e.message);
  }
  return archetype;
}

/** 阅读人格详情：basis + 人物原型 + 行为节律（数据对齐 PRD 9.2） */
async function persona({ userId }) {
  const analysis = await getAnalysisDoc(userId);
  if (!analysis) {
    throw new BizError(ERR.ANALYSIS_NOT_READY, '尚未开始 AI 分析');
  }
  const result = requireStepResult(analysis, 'persona', '阅读人格');
  const agg = (analysis.steps.aggregate && analysis.steps.aggregate.result) || {};
  const stats = agg.stats || {};
  const pItem = (result.items || []).find((it) => it.id === 'p_time') || {};
  const itemStats = pItem.stats || {};
  const rhythm = {
    peakHour: itemStats.peakHour || 0,
    nightRatio: itemStats.nightRatio || 0,
    // 上游无单次会话数据，近似 = 累计阅读时长 / 活跃天数
    avgSessionSeconds: stats.readDays ? Math.round((stats.totalReadTime || 0) / stats.readDays) : 0,
    readDays: stats.readDays || 0,
    totalReadTime: stats.totalReadTime || 0,
  };
  const archetype = await loadArchetype(userId, analysis, rhythm, stats);
  const details = (analysis.steps.persona && analysis.steps.persona.details) || {};
  return {
    dimension: 'persona',
    title: '阅读人格',
    summary: result.summary || '',
    basis: { readDays: rhythm.readDays, bookCount: stats.bookCount || 0 },
    rhythm,
    archetype,
    myFeedback: details.feedback && details.feedback.type ? details.feedback : null,
  };
}
const UNKNOWN_CACHE_VERSION = 1;

/**
 * 未读之境文案富化（懒 LLM + 缓存）：analyses.steps.unknown.details.enriched。
 * 为每个方向生成 intro（一句话介绍）+ connections（与已有兴趣的连接点）。
 * 失败/超时留空返回（前端隐藏 intro/连接行），不缓存不抛。
 */
async function loadUnknownEnrichment(userId, analysis, items, summary) {
  if (!items.length) return {};
  const ids = items.map((it) => it.id);
  const step = analysis.steps.unknown || {};
  const cache = (step.details || {}).enriched;
  if (cache && cache.v === UNKNOWN_CACHE_VERSION && cache.items && ids.every((id) => cache.items[id])) {
    return cache.items;
  }

  const prompt = [
    {
      role: 'system',
      content:
        '你是阅读探索推荐助手。针对用户可能喜欢的新阅读方向，为每个方向生成：intro（领域一句话介绍，25-40 字，描述用户可能抵达哪里，禁止"你缺少""必须补齐"等焦虑表达）、connections（1-2 个与用户已有兴趣/关注点的连接，每项 name ≤10 字）。输出 JSON：{"items":{"<方向id>":{"intro":"...","connections":[{"name":"..."}]}}}',
    },
    {
      role: 'user',
      content: `用户分析摘要：${summary || ''}\n候选新方向：\n${items
        .map((it) => `- id=${it.id} ${it.name}：${it.reason || ''}`)
        .join('\n')}\n为每个方向输出 intro 与 connections，id 逐字使用。`,
    },
  ];
  let out = {};
  try {
    const { json } = await withDeadline(llmChatJson(prompt), 13000);
    const raw = (json && json.items) || {};
    for (const id of ids) {
      const e = raw[id];
      if (!e) continue;
      out[id] = {
        intro: String(e.intro || '').slice(0, 80),
        connections: (e.connections || [])
          .slice(0, 2)
          .map((c) => ({ type: 'topic', name: String(c.name || '').slice(0, 12) }))
          .filter((c) => c.name),
      };
    }
  } catch (e) {
    console.warn('[explore/unknown] enrichment LLM 失败，留空返回:', e && e.message);
    return {};
  }
  if (!Object.keys(out).length) return {};

  // 回写缓存：重读 analyses 且 status==='done' 才写
  try {
    const fresh = await getAnalysisDoc(userId);
    if (fresh && fresh.status === 'done' && fresh.steps && fresh.steps.unknown) {
      const details = fresh.steps.unknown.details || {};
      details.enriched = { v: UNKNOWN_CACHE_VERSION, generatedAt: db.now(), items: out };
      fresh.steps.unknown.details = details;
      await saveAnalysis(fresh);
    }
  } catch (e) {
    console.warn('[explore/unknown] enrichment 缓存回写失败（不影响返回）:', e && e.message);
  }
  return out;
}

/** 未读之境详情：affinityLabel（定性语言，无分数）+ intro/连接（懒 LLM）+ 多形态入口（数据对齐 PRD 9.3） */
async function unknown({ userId }) {
  const analysis = await getAnalysisDoc(userId);
  if (!analysis) {
    throw new BizError(ERR.ANALYSIS_NOT_READY, '尚未开始 AI 分析');
  }
  const result = requireStepResult(analysis, 'unknown', '未知领域');
  const details = (analysis.steps.unknown && analysis.steps.unknown.details) || {};
  const feedbackMap = details.feedback || {};
  const enrichment = await loadUnknownEnrichment(userId, analysis, result.items || [], result.summary);

  const items = [];
  for (const it of result.items || []) {
    const en = enrichment[it.id] || {};
    const books = (it.entryBooks || []).map((b) => ({ bookId: b.bookId, title: b.title || '', author: b.author || '', cover: b.cover || '' }));
    let entry;
    if (books.length > 1) {
      entry = { type: 'book_list', title: `从《${books[0].title}》等几本入门书开始`, payload: { books } };
    } else if (books.length === 1) {
      entry = { type: 'book', title: `从《${books[0].title}》开始`, payload: { books } };
    } else {
      entry = { type: 'question', title: `带着「${it.name}如何回应我已有的好奇」的问题去读一读`, payload: {} };
    }
    items.push({
      id: it.id,
      name: it.name,
      intro: en.intro || '',
      // 定性亲和语言：potential=连接很强，blind=意外的可能（不展示分数）
      affinityLabel: it.level === 'blind' ? '意外的可能' : '连接很强',
      reason: it.reason || '',
      connections: (en.connections || []).map((c) => ({ ...c, evidenceMomentIds: it.momentIds || [] })),
      entry,
      myFeedback: feedbackMap[it.id] || null,
    });
  }
  return {
    dimension: 'unknown',
    title: '未读之境',
    summary: result.summary || '',
    basis: { bookCount: ((analysis.steps.aggregate.result || {}).stats || {}).bookCount || 0 },
    forming: !items.length,
    items,
  };
}

/** 反馈写接口公共部分：重读最新 analyses，写 details 后整文档保存 */
async function writeFeedbackDetails(userId, stepKey, mutate) {
  const fresh = await getAnalysisDoc(userId);
  if (!fresh) throw new BizError(ERR.ANALYSIS_NOT_READY, '尚未开始 AI 分析');
  requireStepResult(fresh, stepKey, '该维度'); // 未完成不允许反馈
  const details = fresh.steps[stepKey].details || {};
  mutate(details);
  fresh.steps[stepKey].details = details;
  await saveAnalysis(fresh);
}

const PERSONA_FEEDBACK_TYPES = ['like', 'somewhat', 'dislike'];

/** 阅读人格反馈：like | somewhat | dislike（进入下一次画像更新，不立即替换人物） */
async function personaFeedback({ userId, params }) {
  const type = params.type;
  if (!PERSONA_FEEDBACK_TYPES.includes(type)) throw new BizError(ERR.BAD_PARAMS, '无效的反馈类型');
  await writeFeedbackDetails(userId, 'persona', (details) => {
    details.feedback = { type, at: db.now() };
  });
  return { saved: true, type };
}

const UNKNOWN_FEEDBACK_TYPES = ['interested', 'not_interested', 'already_read'];

/** 未读之境方向反馈：interested | not_interested | already_read（下一版推荐再调整） */
async function unknownFeedback({ userId, params }) {
  const { id, type } = params;
  if (!UNKNOWN_FEEDBACK_TYPES.includes(type)) throw new BizError(ERR.BAD_PARAMS, '无效的反馈类型');
  if (!id) throw new BizError(ERR.BAD_PARAMS, '缺少方向 id');
  await writeFeedbackDetails(userId, 'unknown', (details) => {
    details.feedback = details.feedback || {};
    details.feedback[id] = { type, at: db.now() };
  });
  return { saved: true, id, type };
}


/** 知识地图：聚合层。nodes = 知识领域(domain) + 兴趣/长期主题(theme)，edges = 证据书交集强度 */
async function map({ userId }) {
  const analysis = await getAnalysisDoc(userId);
  if (!analysis) {
    throw new BizError(ERR.ANALYSIS_NOT_READY, '尚未开始 AI 分析');
  }
  const kResult = requireStepResult(analysis, 'knowledge', '知识结构');
  const steps = analysis.steps || {};
  const iResult = steps.interest && steps.interest.status === 'done' ? steps.interest.result : null;

  const nodes = [];
  const domains = [];
  for (const it of (kResult.items || []).slice(0, 8)) {
    nodes.push({ id: it.id, name: it.name, type: 'domain', weight: it.readingTime || it.bookCount || 1 });
    domains.push(it);
  }
  const themes = [];
  if (iResult) {
    for (const it of (iResult.items || []).slice(0, 8)) {
      nodes.push({ id: it.id, name: it.name, type: 'theme', weight: it.momentCount || 1 });
      themes.push(it);
    }
  }

  // edge 强度：主题的证据瞬间落在某领域的书上的比例
  const edges = [];
  if (themes.length) {
    const bookCat = new Map();
    const books = await db.fetchAll({ name: 'books', where: { userId }, fields: { bookId: true, category: true }, max: 1000 });
    for (const b of books) {
      bookCat.set(b.bookId, String(b.category || '').split('-')[0].trim() || '其他');
    }
    const catToDomain = new Map(domains.map((d) => [d.name, d.id]));
    const momentDomain = new Map();
    for (const d of domains) {
      for (const mid of d.momentIds || []) momentDomain.set(mid, d.id);
    }
    for (const t of themes) {
      const counter = new Map();
      for (const mid of t.momentIds || []) {
        const domId = momentDomain.get(mid);
        if (domId) counter.set(domId, (counter.get(domId) || 0) + 1);
      }
      for (const [domId, c] of counter) {
        edges.push({ source: domId, target: t.id, strength: Math.round((c / (t.momentIds || 1).length) * 100) / 100 });
      }
    }
  }

  return { nodes, edges };
}

/** 竞速超时：到点即放弃等待（底层请求不强杀，函数 20s 超时内安全） */
function withDeadline(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`deadline ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 最大余数法：raws（百分数小数）凑整到总和 100 */
function largestRemainder(raws) {
  const floors = raws.map((r) => Math.floor(r));
  const out = floors.slice();
  let rem = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raws
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rem <= 0) break;
    out[i] += 1;
    rem -= 1;
  }
  return out;
}

/** 父主题占比：阅读时长 / Σ全部 items（总时长为 0 时退 bookCount 份额） */
function parentPercent(item, items) {
  const totalRt = items.reduce((a, it) => a + (it.readingTime || 0), 0);
  if (totalRt > 0) return Math.round(((item.readingTime || 0) / totalRt) * 100);
  const totalBc = items.reduce((a, it) => a + (it.bookCount || 0), 0) || 1;
  return Math.round(((item.bookCount || 0) / totalBc) * 100);
}

const KNOWLEDGE_CACHE_VERSION = 1;

/**
 * 子主题洞察文案（懒 LLM + 缓存）。
 * 缓存存 analyses.steps.knowledge.details[itemId] = { v, generatedAt, children:[{id,desc,common}] }；
 * 失败/超时留空返回，不缓存不抛（详情页隐藏 desc/common 行）。
 */
async function loadInsights(userId, analysis, item, childDefs) {
  if (!childDefs.length) return {};
  const childIds = childDefs.map((c) => `${item.id}_${c.name}`);

  const step = (analysis.steps && analysis.steps.knowledge) || {};
  const cache = (step.details || {})[item.id];
  if (cache && cache.v === KNOWLEDGE_CACHE_VERSION && Array.isArray(cache.children)) {
    const map = {};
    for (const c of cache.children) if (c && c.id) map[c.id] = c;
    if (childIds.every((cid) => map[cid])) return map; // 缓存覆盖当前全部子主题才直接用
  }

  const prompt = [
    {
      role: 'system',
      content:
        '你是阅读洞察助手。基于用户的真实阅读数据写洞察，第二人称口吻，禁止编造书名，不用感叹号。输出 JSON：{"children":[{"id":"...","desc":"...","common":"..."}]}',
    },
    {
      role: 'user',
      content: `阅读主题「${item.name}」由以下子话题组成：\n${childDefs
        .map((c) => `- ${c.name}（${c.bookCount} 本书）`)
        .join('\n')}\n为每个子话题输出：desc（这段阅读对你意味着什么，40-70 字，第二人称）、common（这些书之间的跨书共性，30-50 字）。id 逐字使用：\n${childIds.join('\n')}`,
    },
  ];
  const map = {};
  try {
    const { json } = await withDeadline(llmChatJson(prompt), 13000);
    for (const c of (json && json.children) || []) {
      if (c && c.id && childIds.includes(String(c.id))) {
        map[String(c.id)] = { id: String(c.id), desc: String(c.desc || '').slice(0, 150), common: String(c.common || '').slice(0, 120) };
      }
    }
  } catch (e) {
    console.warn('[knowledge_detail] LLM 生成失败，留空返回:', e && e.message);
    return {};
  }
  if (!Object.keys(map).length) return {};

  // 回写缓存：重读 analyses 且 status==='done' 才写（避免覆盖进行中的分析）
  try {
    const fresh = await getAnalysisDoc(userId);
    if (fresh && fresh.status === 'done' && fresh.steps && fresh.steps.knowledge) {
      const details = fresh.steps.knowledge.details || {};
      details[item.id] = { v: KNOWLEDGE_CACHE_VERSION, generatedAt: db.now(), children: childIds.map((cid) => map[cid]).filter(Boolean) };
      fresh.steps.knowledge.details = details;
      await saveAnalysis(fresh);
    }
  } catch (e) {
    console.warn('[knowledge_detail] 缓存回写失败（不影响返回）:', e && e.message);
  }
  return map;
}

/**
 * 知识气泡详情：主题占比/时长/书数/瞬间数 + 子主题组成（percent 凑 100、代表书目 3 本、懒 LLM 洞察）。
 * 子主题对账：分析快照 children 的名称须命中当前 books 里的新鲜二级段，零命中丢弃；全不匹配→按书数重建 top3。
 */
async function knowledgeDetail({ userId, params }) {
  const id = params.id;
  if (!id) throw new BizError(ERR.BAD_PARAMS, '缺少主题 id');

  const analysis = await getAnalysisDoc(userId);
  if (!analysis) throw new BizError(ERR.ANALYSIS_NOT_READY, '尚未开始 AI 分析');
  const kResult = requireStepResult(analysis, 'knowledge', '知识结构');
  const items = kResult.items || [];
  const item = items.find((it) => it.id === id);
  if (!item) throw new BizError(ERR.NOT_FOUND, '主题不存在');

  const books = await db.fetchAll({
    name: 'books',
    where: { userId },
    fields: { bookId: true, title: true, cover: true, category: true, noteCount: true, highlightTotal: true, momentCount: true },
    max: 1000,
  });
  const topicBooks = books.filter((b) => String(b.category || '').split('-')[0].trim() === item.name);

  // moments 经 bookId → 主题书 归属计数
  const moments = await db.fetchAll({ name: 'moments', where: { userId }, fields: { bookId: true }, max: 5000 });
  const topicBookIds = new Set(topicBooks.map((b) => b.bookId));
  const momentCountOf = new Map();
  for (const m of moments) {
    if (topicBookIds.has(m.bookId)) momentCountOf.set(m.bookId, (momentCountOf.get(m.bookId) || 0) + 1);
  }
  const topicMomentTotal = [...momentCountOf.values()].reduce((a, b) => a + b, 0);

  // 新鲜二级段（当前 books 真实分类）
  const subCount = new Map();
  for (const b of topicBooks) {
    const sub = String(b.category || '').split('-')[1];
    const s = sub && sub.trim();
    if (s) subCount.set(s, (subCount.get(s) || 0) + 1);
  }

  let childDefs = [];
  if (subCount.size) {
    const fresh = [...subCount.entries()].sort((a, b) => b[1] - a[1]);
    const matched = (item.children || [])
      .map((c) => {
        const hit = fresh.find(([name]) => name === c.name);
        return hit ? { name: c.name, bookCount: hit[1] } : null;
      })
      .filter(Boolean);
    childDefs = matched.length ? matched : fresh.slice(0, 3).map(([name, count]) => ({ name, bookCount: count }));
  }

  // 子主题 percent：bookCount 份额最大余数法凑 100
  const totalCount = childDefs.reduce((a, c) => a + c.bookCount, 0) || 1;
  const pcts = largestRemainder(childDefs.map((c) => (c.bookCount / totalCount) * 100));

  // 每个子主题的代表书：按 (noteCount + momentCount) 降序
  const booksOfSub = new Map();
  for (const b of topicBooks) {
    const sub = String(b.category || '').split('-')[1];
    const s = sub && sub.trim();
    if (!s) continue;
    const arr = booksOfSub.get(s) || [];
    arr.push(b);
    booksOfSub.set(s, arr);
  }
  const weightOf = (b) => (b.noteCount || b.highlightTotal || 0) + (b.momentCount || 0);

  const insights = await loadInsights(userId, analysis, item, childDefs);

  const children = childDefs.map((c, i) => {
    const subBooks = (booksOfSub.get(c.name) || []).sort((a, b) => weightOf(b) - weightOf(a));
    const subBookIds = new Set(subBooks.map((b) => b.bookId));
    const subMomentTotal = [...momentCountOf.entries()].filter(([bid]) => subBookIds.has(bid)).reduce((a, [, n]) => a + n, 0);
    const ins = insights[`${item.id}_${c.name}`] || {};
    return {
      id: `${item.id}_${c.name}`,
      name: c.name,
      percent: pcts[i],
      bookCount: c.bookCount,
      momentCount: subMomentTotal,
      desc: ins.desc || '',
      common: ins.common || '',
      books: subBooks.slice(0, 3).map((b) => ({ bookId: b.bookId, title: b.title || '', cover: b.cover || '' })),
    };
  });

  return {
    id: item.id,
    name: item.name,
    percent: parentPercent(item, items),
    minutes: Math.round((item.readingTime || 0) / 60),
    bookCount: item.bookCount,
    momentCount: topicMomentTotal,
    children,
  };
}

module.exports = {
  overview,
  knowledge,
  interest,
  thinking,
  longTerm,
  persona,
  unknown,
  map,
  knowledgeDetail,
  personaFeedback,
  unknownFeedback,
  DIMENSIONS,
};
