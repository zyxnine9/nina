const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { makeGateway } = require('./lib/gateway');

const route = makeGateway(
  {
    import_key: require('./actions/import').importKey,
    import_status: require('./actions/import').importStatus,
    import_step: require('./actions/import').importStep,
    import_sync: require('./actions/import').importSync,
  },
  'nina-import'
);

exports.main = async (event) => {
  try {
    return await route(event);
  } catch (err) {
    console.error('[nina-import] fatal:', err && err.message, err && err.stack);
    return { code: 50000, message: '服务内部错误', data: null };
  }
};
