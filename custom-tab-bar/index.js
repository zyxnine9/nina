Component({
  data: {
    value: '', // 初始值设置为空，避免第一次加载时闪烁
    list: [
      { value: 'discover', label: '发现' },
      { value: 'explore', label: '探索' },
      { value: 'traces', label: '痕迹' },
      { value: 'my', label: '我的' },
    ],
  },
  lifetimes: {
    ready() {
      this.syncValue();
    },
  },
  methods: {
    // 由各 tab 页 onShow 调用：页面每次显示都按当前路由同步高亮
    //（覆盖 switchTab/navigateBack/reLaunch 等非点击到达；custom-tab-bar 拿不到 pageLifetimes）
    syncValue() {
      const pages = getCurrentPages();
      const curPage = pages[pages.length - 1];
      if (curPage) {
        const nameRe = /pages\/(\w+)\/index/.exec(curPage.route);
        if (nameRe && nameRe[1]) {
          this.setData({ value: nameRe[1] });
        }
      }
    },
    handleChange(e) {
      const { value } = e.currentTarget.dataset;
      this.setData({ value });
      wx.switchTab({ url: `/pages/${value}/index` });
    },
  },
});
