/**
 * 探索页 actions：explore_overview + 六维（knowledge/interest/thinking/long_term/persona/unknown）+ explore_map。
 * 未完成的维度返回 50200。数据来自 analyses.steps 对应 result（analyzer 写入）。
 */
const db = require('../lib/db');
const { BizError } = require('../lib/respond');
const { ERR } = require('../config');
const { getAnalysisDoc, requireStepResult, loadMoments } = require('../lib/exploreUtils');
const { momentItem } = require('../lib/momentItem');

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

module.exports = { overview, knowledge, interest, thinking, longTerm, persona, unknown, map, DIMENSIONS };
