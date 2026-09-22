/**
 * moments 文档 → 前端展示结构（内容 / 发现 / 探索多域复用）。
 */
function momentItem(doc) {
  return {
    momentId: doc._id,
    type: doc.type,
    text: doc.text,
    comment: doc.comment,
    abstract: doc.abstract,
    book: doc.book,
    chapterTitle: doc.chapterTitle,
    categoryId: doc.categoryId,
    categoryName: doc.categoryName,
    createdAt: doc.createdAt,
  };
}

module.exports = { momentItem };
