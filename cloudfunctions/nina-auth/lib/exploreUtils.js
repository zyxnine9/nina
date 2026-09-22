/**
 * 分析文档（analyses，_id=userId）公共读写 + 进度工具。
 * steps: { [stepKey]: { status: 'done', result, at } }
 */
const db = require('./db');

const STEP_ORDER = [
  'aggregate',
  'tags',
  'headline',
  'interest',
  'knowledge',
  'thinking',
  'long_term',
  'persona',
  'unknown',
  'topics',
];

/** stages（渐进式揭示）→ step 映射 */
const STAGE_STEP_MAP = [
  { key: 'reading_feature', title: '阅读特征', step: 'aggregate' },
  { key: 'identity_tags', title: '身份标签', step: 'tags' },
  { key: 'moments', title: '阅读瞬间', step: 'headline' },
  { key: 'interest', title: '兴趣结构', step: 'interest' },
  { key: 'knowledge', title: '知识结构', step: 'knowledge' },
  { key: 'thinking', title: '思维方式', step: 'thinking' },
  { key: 'long_term', title: '长期关注', step: 'long_term' },
  { key: 'persona', title: '阅读人格', step: 'persona' },
  { key: 'unknown', title: '未知领域', step: 'unknown' },
];

async function getAnalysisDoc(userId) {
  return db.getDoc('analyses', userId);
}

async function saveAnalysis(analysis) {
  const { _id, ...data } = analysis; // TCB 不允许 data 携带 _id
  await db.col('analyses').doc(analysis._id).set({ data });
}

function newAnalysis(userId) {
  return {
    _id: userId,
    userId,
    status: 'running', // running | done | failed
    progress: 0,
    currentStep: STEP_ORDER[0],
    steps: {},
    error: null,
    createdAt: db.now(),
    finishedAt: 0,
  };
}

/** 下一个待执行的 step key，全部完成返回 null */
function nextStep(analysis) {
  for (const key of STEP_ORDER) {
    if (!analysis.steps[key] || analysis.steps[key].status !== 'done') return key;
  }
  return null;
}

function refreshProgress(analysis) {
  const doneCount = STEP_ORDER.filter((k) => analysis.steps[k] && analysis.steps[k].status === 'done').length;
  analysis.progress = Math.round((doneCount / STEP_ORDER.length) * 100);
}

/** 某维度是否已完成（供 explore_* 判断 50200） */
function isStepDone(analysis, stepKey) {
  const steps = (analysis && analysis.steps) || {};
  return Boolean(steps[stepKey] && steps[stepKey].status === 'done');
}

/** 取已完成 step 的 result，未完成抛 50200 */
function requireStepResult(analysis, stepKey, title) {
  if (!isStepDone(analysis, stepKey)) {
    const { BizError } = require('./respond');
    const { ERR } = require('../config');
    throw new BizError(ERR.ANALYSIS_NOT_READY, `${title || '该分析'}尚未完成，请先完成 AI 分析`);
  }
  return analysis.steps[stepKey].result;
}

/** 按 id 批量取 moments（含 userId 校验） */
async function loadMoments(userId, momentIds) {
  const out = [];
  for (const id of momentIds || []) {
    const doc = await db.getDoc('moments', id);
    if (doc && doc.userId === userId) out.push(doc);
  }
  return out;
}

/**
 * 证据锚定：LLM 只输出原文片段 quotes，服务端在 moments 原文里包含匹配回填 momentIds（防幻觉）。
 * 归一化：去空白后做 indexOf 包含匹配。
 */
function anchorQuotes(quotes, moments) {
  const norm = (s) => String(s || '').replace(/\s+/g, '');
  const hits = [];
  for (const q of quotes || []) {
    const nq = norm(q);
    if (!nq || nq.length < 4) continue;
    for (const m of moments) {
      if (hits.includes(m._id)) continue;
      const nt = norm(m.text);
      const nc = norm(m.comment || '');
      if ((nt && nt.includes(nq)) || (nc && nc.includes(nq))) {
        hits.push(m._id);
        break;
      }
    }
  }
  return hits;
}

module.exports = {
  STEP_ORDER,
  STAGE_STEP_MAP,
  getAnalysisDoc,
  saveAnalysis,
  newAnalysis,
  nextStep,
  refreshProgress,
  isStepDone,
  requireStepResult,
  loadMoments,
  anchorQuotes,
};
