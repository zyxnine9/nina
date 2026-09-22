import { callAction } from './request';

/**
 * 长任务驱动：前端轮询云函数 *_step 推进 job 断点，直到 done/failed。
 * 单次 callFunction 客户端超时不确定（15s~60s），云函数侧有 9s 软预算，
 * 这里轮询间隔 1.5s，单次 step 调用超时后自动重试下一次。
 */
const POLL_INTERVAL = 1500;
const STEP_TIMEOUT_RETRY = 2; // 单次 step 失败重试次数（网络/超时类）

function drive({ stepAction, statusAction, onProgress, onFinish }) {
  let stopped = false;
  let timer = null;

  const promise = new Promise((resolve, reject) => {
    async function tick(retries = STEP_TIMEOUT_RETRY) {
      if (stopped) return;
      try {
        await callAction(stepAction, {});
      } catch (err) {
        // step 调用失败：可能是超时，重试几次；job 侧断点保证幂等
        if (retries > 0 && !stopped) {
          timer = setTimeout(() => tick(retries - 1), POLL_INTERVAL);
          return;
        }
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
