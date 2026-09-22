const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { makeGateway } = require('./lib/gateway');

const route = makeGateway(
  {
    moments_list: require('./actions/content').momentsList,
    moments_detail: require('./actions/content').momentsDetail,
    categories: require('./actions/content').categories,
    books_list: require('./actions/content').booksList,
    topics_list: require('./actions/content').topicsList,
    topics_detail: require('./actions/content').topicsDetail,
    share_cards: require('./actions/share').createCard,
  },
  'nina-content'
);

exports.main = async (event) => {
  try {
    return await route(event);
  } catch (err) {
    console.error('[nina-content] fatal:', err && err.message, err && err.stack);
    return { code: 50000, message: '服务内部错误', data: null };
  }
};
