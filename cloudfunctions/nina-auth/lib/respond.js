const { ERR } = require('../config');

/** 成功回包 {code:0, message:'ok', data} */
function ok(data = {}, message = 'ok') {
  return { code: ERR.OK, message, data };
}

/** 失败回包，message 可直接 toast */
function err(code, message, data = null) {
  return { code, message, data };
}

/** 业务异常：action 内 throw，router 统一转成回包（不打印堆栈） */
class BizError extends Error {
  constructor(code, message, data = null) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

module.exports = { ok, err, BizError };
