const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { makeGateway } = require('./lib/gateway');

const route = makeGateway(
  {
    analysis_run: require('./actions/analysis').run,
    analysis_status: require('./actions/analysis').status,
    analysis_step: require('./actions/analysis').step,
  },
  'nina-analysis'
);

exports.main = async (event) => {
  try {
    return await route(event);
  } catch (err) {
    console.error('[nina-analysis] fatal:', err && err.message, err && err.stack);
    return { code: 50000, message: '服务内部错误', data: null };
  }
};
