/**
 * 分析 actions：analysis_run / analysis_status / analysis_step。
 * status 的 stages[].revealed = 对应 step 完成，直接映射渐进式揭示。
 */
const db = require('../lib/db');
const analyzer = require('../lib/analyzer');
const importer = require('../lib/importer');
const { STAGE_STEP_MAP, getAnalysisDoc, saveAnalysis, newAnalysis } = require('../lib/exploreUtils');
const { BizError } = require('../lib/respond');
const { ERR, PIGGYBACK_BUDGET_MS } = require('../config');

/** 触发分析：有导入数据才允许 */
async function run({ userId }) {
  const momentCount = await db.countOf('moments', { userId });
  if (!momentCount) {
    throw new BizError(ERR.BAD_PARAMS, '暂无阅读数据，请先完成数据导入');
  }
  const existing = await getAnalysisDoc(userId);
  if (existing && existing.status === 'running') {
    return { analysisId: userId };
  }
  const analysis = newAnalysis(userId);
  await saveAnalysis(analysis);
  return { analysisId: userId };
}

async function status({ userId }) {
  const analysis = await getAnalysisDoc(userId);
  if (!analysis) {
    throw new BizError(ERR.NOT_FOUND, '尚未开始分析');
  }
  const steps = analysis.steps || {};
  return {
    analysisId: userId,
    status: analysis.status,
    progress: analysis.progress || 0,
    stages: STAGE_STEP_MAP.map((s) => ({
      key: s.key,
      title: s.title,
      revealed: Boolean(steps[s.step] && steps[s.step].status === 'done'),
    })),
  };
}

/** 轮询推进一步（一个 step 含 1-2 次 LLM 调用，可能耗时较长） */
async function step({ userId }) {
  // 顺手推进轻量导入的后台补齐（quick job 未补齐时在 5s 预算内续推，失败不影响分析）
  await importer.backfill(userId, PIGGYBACK_BUDGET_MS).catch(() => {});
  let analysis = await getAnalysisDoc(userId);
  if (!analysis) {
    throw new BizError(ERR.NOT_FOUND, '尚未开始分析，请先调用 analysis_run');
  }
  if (analysis.status === 'done' || analysis.status === 'failed') {
    return statusSnapshot(analysis);
  }
  try {
    analysis = await analyzer.advance(userId);
  } catch (e) {
    // LLM 失败不置 failed：step 可重试，回包带上错误信息
    console.error(`[analysis_step] userId=${userId} step=${analysis.currentStep}:`, e && e.message);
    const fresh = await getAnalysisDoc(userId);
    fresh.lastError = (e && e.message) || 'step failed';
    await saveAnalysis(fresh);
    const snap = statusSnapshot(fresh);
    snap.error = snap.error || 'AI 分析这一步失败了，请稍后重试';
    return snap;
  }
  return statusSnapshot(analysis);
}

function statusSnapshot(analysis) {
  const steps = analysis.steps || {};
  return {
    analysisId: analysis._id,
    status: analysis.status,
    progress: analysis.progress || 0,
    currentStep: analysis.currentStep || '',
    stages: STAGE_STEP_MAP.map((s) => ({
      key: s.key,
      title: s.title,
      revealed: Boolean(steps[s.step] && steps[s.step].status === 'done'),
    })),
  };
}

module.exports = { run, status, step, statusSnapshot };
