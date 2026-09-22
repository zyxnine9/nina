/**
 * 划线 ↔ 评论 range 区间重叠匹配（NINA_API.md v0.3 第 10 节规则）：
 * - 同书同章节分桶
 * - 评论 range 与划线 range 计算重叠：overlap / reviewLen ≥ 0.8 → 挂载为该划线的 comment
 * - 未达阈值的评论独立成 type=review 瞬间，不强行挂载
 */

function parseRange(r) {
  if (!r) return null;
  const m = String(r).match(/^(\d+)-(\d+)$/);
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (!(end > start)) return null;
  return { start, end, len: end - start };
}

function overlapLen(a, b) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/**
 * @param {Array} bookmarks 上游 updated[]：{bookmarkId, chapterUid, range, markText, createTime, ...}
 * @param {Array} reviews   上游 reviews[]：{reviewId, content, abstract, range, chapterUid, chapterTitle, createTime}
 * @returns {{highlights: Array, standaloneReviews: Array}}
 *  highlights[].comment = { text, abstract, confidence, reviewId }
 */
function matchCommentsToHighlights(bookmarks, reviews) {
  const byChapter = new Map();
  for (const b of bookmarks) {
    const r = parseRange(b.range);
    if (!r) continue;
    const key = b.chapterUid;
    if (!byChapter.has(key)) byChapter.set(key, []);
    byChapter.get(key).push({ bookmark: b, range: r, comment: null, confidence: 0 });
  }

  const standaloneReviews = [];
  for (const rv of reviews) {
    const rr = parseRange(rv.range);
    if (!rr) {
      standaloneReviews.push(rv);
      continue;
    }
    const candidates = byChapter.get(rv.chapterUid) || [];
    let best = null;
    let bestRatio = 0;
    for (const c of candidates) {
      const ov = overlapLen(rr, c.range);
      const ratio = ov / rr.len;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = c;
      }
    }
    if (best && bestRatio >= 0.8) {
      // 一条划线只挂一条最优评论，后到的高置信评论顶替低置信的
      if (!best.comment || bestRatio > best.confidence) {
        best.comment = {
          text: rv.content || '',
          abstract: rv.abstract || '',
          confidence: Math.round(bestRatio * 100) / 100,
          reviewId: rv.reviewId,
        };
      }
    } else {
      standaloneReviews.push(rv);
    }
  }

  const highlights = [];
  for (const list of byChapter.values()) {
    for (const c of list) highlights.push(c);
  }
  // 未解析出 range 的划线也保留（无 comment）
  for (const b of bookmarks) {
    if (!parseRange(b.range)) {
      highlights.push({ bookmark: b, range: null, comment: null, confidence: 0 });
    }
  }
  return { highlights, standaloneReviews };
}

module.exports = { matchCommentsToHighlights, parseRange, overlapLen };
