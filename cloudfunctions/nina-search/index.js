const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { makeGateway } = require('./lib/gateway');

const route = makeGateway(
  {
    search: require('./actions/search').search,
  },
  'nina-search'
);

exports.main = async (event) => {
  try {
    return await route(event);
  } catch (err) {
    console.error('[nina-search] fatal:', err && err.message, err && err.stack);
    return { code: 50000, message: '服务内部错误', data: null };
  }
};
