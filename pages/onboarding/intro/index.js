Page({
  onStartImport() {
    wx.navigateTo({ url: '/pages/onboarding/key-input/index' });
  },
  onSkip() {
    wx.setStorageSync('nina_onboard_skipped', 1);
    wx.reLaunch({ url: '/pages/discover/index' });
  },
});
