/** 秒级时间戳 → 「2026-05-12」 */
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const p = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

Component({
  properties: {
    // 结构对齐 NINA_API.md 8.1 item：
    // { momentId, type: 'highlight'|'review', text, comment, book:{bookId,title,author,cover}, chapterTitle, categoryId, categoryName, createdAt }
    moment: {
      type: Object,
      value: {},
      observer(val) {
        this.setData({ dateText: formatDate(val.createdAt) });
      },
    },
  },
  data: {
    dateText: '',
  },
  lifetimes: {
    attached() {
      this.setData({ dateText: formatDate(this.data.moment.createdAt) });
    },
  },
});
