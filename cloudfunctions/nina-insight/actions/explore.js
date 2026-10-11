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
async function thinking(ctx) {
  return dimensionResult(ctx.userId, 'thinking', '思维方式');
}
async function longTerm(ctx) {
  return dimensionResult(ctx.userId, 'long_term', '长期关注');
}
async function persona(ctx) {
  return dimensionResult(ctx.userId, 'persona', '阅读人格');
}
async function unknown(ctx) {
  return dimensionResult(ctx.userId, 'unknown', '未知领域');
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

module.exports = { overview, knowledge, interest, thinking, longTerm, persona, unknown, map, knowledgeDetail, DIMENSIONS };
