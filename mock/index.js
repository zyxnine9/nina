import Mock from './WxMock';
// 导入包含path和data的对象
import loginMock from './login/index';
import homeMock from './home/index';
import searchMock from './search/index';
import dataCenter from './dataCenter/index';
import my from './my/index';
import discoverMock from './discover/index';
import exploreMock from './explore/index';
import tracesMock from './traces/index';
import onboardingMock from './onboarding/index';

export default () => {
  // 在这里添加新的mock数据
  const mockData = [...loginMock, ...homeMock, ...searchMock, ...dataCenter, ...my, ...discoverMock, ...exploreMock, ...tracesMock, ...onboardingMock];
  mockData.forEach((item) => {
    // data 为函数时：函数式 mock，接收 wx.request 的 data 入参（WxMock 顶层函数模板支持）
    const template =
      typeof item.data === 'function'
        ? (config) => ({ code: 200, success: true, data: item.data(config.data || {}) })
        : { code: 200, success: true, data: item.data };
    Mock.mock(item.path, template);
  });
};
