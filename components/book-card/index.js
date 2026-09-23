Component({
  properties: {
    // 结构对齐 NINA_API.md 8.4 item
    book: {
      type: Object,
      value: {},
    },
  },
  data: {
    stats: [],
  },
  observers: {
    book(val) {
      if (!val || !val.bookId) return;
      const stats = [{ label: '个瞬间', value: val.momentCount || 0 }];
      if (val.highlightCount) stats.push({ label: '条划线', value: val.highlightCount });
      if (val.reviewCount) stats.push({ label: '条想法', value: val.reviewCount });
      this.setData({ stats });
    },
  },
});
