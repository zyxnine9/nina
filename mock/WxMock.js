/* eslint-disable */
var __request = wx.request;
var Mock = require('./mock.js');
Object.defineProperty(wx, 'request', { writable: true });
wx.request = function (config) {
  if (typeof Mock._mocked[config.url] == 'undefined') {
    __request(config);
    return;
  }
  var resTemplate = Mock._mocked[config.url].template;
  // 顶层函数模板：直接调用并传入本次请求 config（含 data 入参），不走 mockjs 生成
  var response =
    typeof resTemplate == 'function' ? resTemplate(config) : Mock.mock(resTemplate);
  if (typeof config.success == 'function') {
    config.success(response);
  }
  if (typeof config.complete == 'function') {
    config.complete(response);
  }
};
module.exports = Mock;
