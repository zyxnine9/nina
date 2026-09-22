/**
 * 云函数网关工厂：注入 OPENID 身份、异常兜底、未知 action 40400。
 * 每个云函数的 index.js 用 makeGateway(actionMap) 生成 main 处理器，
 * actionMap 形如 { auth_login: require('./actions/auth').login, ... }
 */
const cloud = require('wx-server-sdk');
const db = require('./db');
const { ok, err, BizError } = require('./respond');
const { ERR } = require('../config');

let dbInited = false;

function makeGateway(actionMap, logTag = 'nina') {
  if (!dbInited) {
    db.init(cloud);
    dbInited = true;
  }

  return async function route(event) {
    const action = event && event.action;
    const params = (event && event.params) || {};

    const handler = actionMap[action];
    if (!handler) {
      return err(ERR.NOT_FOUND, `未知 action: ${action}`);
    }

    // 身份：微信云函数自动注入 OPENID，无需 JWT
    const wxContext = cloud.getWXContext();
    const userId = wxContext && wxContext.OPENID;
    if (!userId) {
      return err(ERR.UNAUTHORIZED, '未登录或身份缺失');
    }

    try {
      const data = await handler({ userId, params, cloud });
      return ok(data);
    } catch (e) {
      if (e instanceof BizError) {
        return err(e.code, e.message, e.data);
      }
      console.error(`[${logTag}] action=${action} userId=${userId} error:`, e && e.message, e && e.stack);
      return err(ERR.INTERNAL, '服务内部错误');
    }
  };
}

module.exports = { makeGateway };
