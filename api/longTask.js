import { callAction } from './request';

/**
 * 长任务驱动：前端轮询云函数 *_step 推进 job 断点，直到 done/failed。
 * 单次 callFunction 客户端超时不确定（15s~60s），云函数侧有 9s 软预算，
 * 这里轮询间隔 1.5s，单次 step 调用超时后自动重试下一次。
 */
const POLL_INTERVAL = 1500;
const STEP_MAX_TRANSIENT_FAILS = 4; // 连续网络类失败阈值，超过判定任务无法推进

function drive({ stepAction, statusAction, onProgress, onFinish }) {
  let stopped = false;
  let timer = null;
  let transientFails = 0;

  const promise = new Promise((resolve, reject) => {
    async function tick() {
      if (stopped) return;
      let stepFailed = false;
      try {
        // 注意：callAction 对业务错误不 reject，而是 resolve {data:{code≠0}}
        const stepRes = await callAction(stepAction, {});
        const code = stepRes.data && stepRes.data.code;
        if (code !== 0) {
          if (code !== 50000) {
            // 业务错误（KEY 失效/无任务等）：重试无意义，立即终止并把错误交给页面
            const errData = stepRes.data;
            if (onFinish) onFinish(errData);
            reject(errData);
            return;
          }
          stepFailed = true; // 50000 多为 callFunction 超时，可重试（断点保证幂等）
        }
      } catch (err) {
        stepFailed = true;
      }
      transientFails = stepFailed ? transientFails + 1 : 0;
      if (transientFails >= STEP_MAX_TRANSIENT_FAILS) {
        const errData = { code: 50000, message: '任务推进失败，请检查网络后重试' };
        if (onFinish) onFinish(errData);
        reject(errData);
        return;
      }
      if (stopped) return;
      try {
        const res = await callAction(statusAction, {});
        const status = res.data && res.data.data;
        if (onProgress) onProgress(status);
        if (status && (status.stage === 'done' || status.status === 'done')) {
          if (onFinish) onFinish(status);
          resolve(status);
          return;
        }
        if (status && (status.stage === 'failed' || status.status === 'failed')) {
          if (onFinish) onFinish(status);
          reject(status);
          return;
        }
      } catch (err) {
        // status 查询失败不终止，继续下一轮
      }
      if (!stopped) timer = setTimeout(() => tick(), POLL_INTERVAL);
    }
    tick();
  });

  return {
    promise,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

/** 驱动数据导入：import_step 循环，直到 import_status 返回 done/failed */
export function driveImport({ onProgress, onFinish } = {}) {
  return drive({ stepAction: 'import_step', statusAction: 'import_status', onProgress, onFinish });
}

/** 驱动 AI 分析：analysis_step 循环，直到 analysis_status 返回 done/failed */
export function driveAnalysis({ onProgress, onFinish } = {}) {
  return drive({ stepAction: 'analysis_step', statusAction: 'analysis_status', onProgress, onFinish });
}
