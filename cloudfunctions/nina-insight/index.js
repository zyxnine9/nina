const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { makeGateway } = require('./lib/gateway');

const route = makeGateway(
  {
    // 发现
    discover_summary: require('./actions/discover').summary,
    tags_list: require('./actions/discover').tagsList,
    tags_detail: require('./actions/discover').tagsDetail,
    tags_feedback: require('./actions/discover').tagsFeedback,
    // 探索
    explore_overview: require('./actions/explore').overview,
    explore_knowledge: require('./actions/explore').knowledge,
    explore_interest: require('./actions/explore').interest,
    explore_thinking: require('./actions/explore').thinking,
    explore_long_term: require('./actions/explore').longTerm,
    explore_persona: require('./actions/explore').persona,
    explore_unknown: require('./actions/explore').unknown,
    explore_map: require('./actions/explore').map,
    knowledge_detail: require('./actions/explore').knowledgeDetail,
  },
  'nina-insight'
);

exports.main = async (event) => {
  try {
    return await route(event);
  } catch (err) {
    console.error('[nina-insight] fatal:', err && err.message, err && err.stack);
    return { code: 50000, message: '服务内部错误', data: null };
  }
};
