Component({
  data: {
    value: '', // 初始值设置为空，避免第一次加载时闪烁
    list: [
      { value: 'discover', label: '发现' },
      { value: 'explore', label: '探索' },
      { value: 'traces', label: '痕迹' },
    ],
  },
  lifetimes: {
    ready() {
      const pages = getCurrentPages();
      const curPage = pages[pages.length - 1];
      if (curPage) {
        const nameRe = /pages\/(\w+)\/index/.exec(curPage.route);
        if (nameRe && nameRe[1]) {
          this.setData({ value: nameRe[1] });
        }
      }
    },
  },
  methods: {
    handleChange(e) {
      const { value } = e.currentTarget.dataset;
      this.setData({ value });
      wx.switchTab({ url: `/pages/${value}/index` });
    },
  },
});
