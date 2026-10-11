const cloud = require('wx-server-sdk');

// DYNAMIC_CURRENT_ENV：部署到哪个环境就用哪个环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { makeGateway } = require('./lib/gateway');

const actionMap = {
  // 认证
  auth_login: require('./actions/auth').login,
  user_profile: require('./actions/auth').profile,
  user_update_profile: require('./actions/auth').updateProfile,
  // 导入
  import_key: require('./actions/import').importKey,
  import_status: require('./actions/import').importStatus,
  import_step: require('./actions/import').importStep,
  import_sync: require('./actions/import').importSync,
  // 内容
  moments_list: require('./actions/content').momentsList,
  moments_detail: require('./actions/content').momentsDetail,
  categories: require('./actions/content').categories,
  books_list: require('./actions/content').booksList,
  topics_list: require('./actions/content').topicsList,
  topics_detail: require('./actions/content').topicsDetail,
  // 分析
  analysis_run: require('./actions/analysis').run,
  analysis_status: require('./actions/analysis').status,
  analysis_step: require('./actions/analysis').step,
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
  // 搜索 / 分享
  search: require('./actions/search').search,
  share_cards: require('./actions/share').createCard,
};

const route = makeGateway(actionMap, 'nina-api');

exports.main = async (event) => {
  try {
    return await route(event);
  } catch (err) {
    // 兜底：网关层之外的任何异常
    console.error('[nina-api] fatal:', err && err.message, err && err.stack);
    return { code: 50000, message: '服务内部错误', data: null };
  }
};
