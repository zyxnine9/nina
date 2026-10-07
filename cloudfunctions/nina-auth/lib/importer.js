/**
 * 导入状态机（极速轻量版）：validating → fetching_shelf → fetching_books → finalizing → done
 *
 * 两阶段「样本先行」：
 * - 快速阶段（一次 import_step 内基本完成）：书架+笔记本概览并行拉取并批量入库，
 *   只深拉笔记最多的前 QUICK_SAMPLE_BOOKS 本（每书前 LIGHT_HIGHLIGHTS 条划线 + LIGHT_REVIEWS 条想法），
 *   采样完直接 finalizing → done，前端 ~10s 看到「导入完成」。
 * - 后台补齐：analysis_step 每次顺手调 backfill()（bookIndex 从断点续推，4 本/组并行，
 *   PIGGYBACK_BUDGET_MS 预算内尽量多组），分析期间把剩余书籍补齐入库，完成后 importMode='backfilled'。
 *
 * 断点机制：import_jobs 文档（_id=userId）持久化 pendingBooks/bookIndex/stats，
 * 每处理完一组立即 checkpoint；moments 写入 = removeWhere(本书) + batchAddDocs（替换式，幂等）。
 */
const db = require('./db');
const { WereadClient } = require('./weread');
const { matchCommentsToHighlights } = require('./matcher');
const { getUserKey } = require('./user');
const { BizError } = require('./respond');
const {
  ERR,
  STEP_DEADLINE_MS,
  PIGGYBACK_BUDGET_MS,
  LIGHT_HIGHLIGHTS,
  LIGHT_REVIEWS,
  QUICK_SAMPLE_BOOKS,
} = require('../config');

// 后台补齐的并行组大小
const BACKFILL_GROUP = 4;

const JOB_STAGE = {
  VALIDATING: 'validating',
  SHELF: 'fetching_shelf',
  BOOKS: 'fetching_books',
  FINALIZE: 'finalizing',
  DONE: 'done',
  FAILED: 'failed',
};

function newJob(userId) {
  return {
    _id: userId,
    userId,
    stage: JOB_STAGE.VALIDATING,
    importMode: 'quick', // quick（轻量采样）→ backfilled（补齐完成）
    progress: 0,
    currentTask: '',
    error: null,
    stats: { bookCount: 0, notebookCount: 0, momentCount: 0, highlightCount: 0, reviewCount: 0 },
    pendingBooks: [],
    bookIndex: 0,
    totalBooks: 0,
    sampleDone: false,
    failedBooks: [],
    removedCount: 0,
    startedAt: db.now(),
    finishedAt: 0,
  };
}

async function saveJob(job) {
  const { _id, ...data } = job; // TCB 不允许 data 携带 _id
  await db.col('import_jobs').doc(job._id).set({ data });
}

async function getJob(userId) {
  return db.getDoc('import_jobs', userId);
}

/** 用户是否有可用 Key，返回 { user, key, client } */
async function requireClient(userId) {
  const user = await db.getDoc('users', userId);
  const key = await getUserKey(user);
  if (!key || (user.keyStatus && user.keyStatus !== 'valid')) {
    throw new BizError(ERR.BAD_PARAMS, '请先提交有效的微信读书 KEY');
  }
  return { user, key, client: new WereadClient(key) };
}

function snapshot(job) {
  return {
    importId: job._id,
    stage: job.stage,
    progress: job.progress || 0,
    stats: job.stats || {},
    currentTask: job.currentTask || '',
    error: job.error || null,
    failedBooks: job.failedBooks || [],
  };
}

/** 书籍一级分类 → 固定大类（痕迹页自动整理的 MVP 实现） */
function bookCategory(raw) {
  const first = String(raw || '').split('-')[0].trim();
  return {
    categoryId: first ? `c_${first}` : 'c_other',
    categoryName: first || '其他',
  };
}

function buildMomentDocs({ userId, bookMeta, chapters, highlights, standaloneReviews }) {
  const chapterMap = {};
  for (const c of chapters || []) chapterMap[c.chapterUid] = c.title;
  const cat = bookCategory(bookMeta.category);
  const baseBook = {
    bookId: bookMeta.bookId,
    title: bookMeta.title,
    author: bookMeta.author || '',
    cover: bookMeta.cover || '',
  };
  const docs = [];
  for (const h of highlights) {
    const b = h.bookmark;
    const comment = h.comment;
    const text = b.markText || '';
    const commentText = comment ? comment.text : '';
    docs.push({
      _id: `${userId}_${b.bookmarkId}`,
      userId,
      bookId: bookMeta.bookId,
      type: 'highlight',
      text,
      comment: commentText || null,
      commentConfidence: comment ? comment.confidence : null,
      abstract: null,
      chapterUid: b.chapterUid,
      chapterTitle: chapterMap[b.chapterUid] || '',
      range: b.range || '',
      createdAt: b.createTime || 0,
      book: baseBook,
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      topicIds: [],
      searchKw: `${baseBook.title} ${baseBook.author} ${text} ${commentText}`.toLowerCase(),
    });
  }
  for (const rv of standaloneReviews) {
    const text = rv.content || '';
    docs.push({
      _id: `${userId}_${rv.reviewId}`,
      userId,
      bookId: bookMeta.bookId,
      type: 'review',
      text,
      comment: null,
      commentConfidence: null,
      abstract: rv.abstract || null,
      chapterUid: rv.chapterUid,
      chapterTitle: rv.chapterTitle || chapterMap[rv.chapterUid] || '',
      range: rv.range || '',
      createdAt: rv.createTime || 0,
      book: baseBook,
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      topicIds: [],
      searchKw: `${baseBook.title} ${baseBook.author} ${text} ${rv.abstract || ''}`.toLowerCase(),
    });
  }
  return docs;
}

/** 书籍文档公共字段（概览批量入库与采样后 upsert 共用） */
function buildBookDoc(userId, meta) {
  return {
    userId,
    bookId: meta.bookId,
    title: meta.title,
    author: meta.author || '',
    cover: meta.cover || '',
    category: meta.category || '',
    noteCount: meta.noteCount || 0,
    reviewCount: meta.reviewCount || 0,
    bookmarkCount: meta.bookmarkCount || 0, // 书签内容上游不可导出，仅数量
    finished: Boolean(meta.finished),
    lastReadAt: meta.readUpdateTime || 0,
    highlightTotal: meta.noteCount || 0, // 笔记本概览的全量笔记数（轻量导入只采样，供完整同步 hook）
    progress: 0,
    readingTime: 0,
    startReadingTime: 0,
    highlightCount: 0,
    momentCount: 0,
  };
}

/** 处理单本书（轻量采样：前 N 条划线 + N 条想法），独立事务单元，非 Key 异常只影响本书 */
async function processOneBook(client, job, meta) {
  const userId = job.userId;
  try {
    const bm = await client.bookmarkList(meta.bookId);
    const highlightsAll = bm.updated || [];
    const reviews = await client.reviewListPage(meta.bookId, LIGHT_REVIEWS);
    const { highlights, standaloneReviews } = matchCommentsToHighlights(
      highlightsAll.slice(0, LIGHT_HIGHLIGHTS),
      reviews
    );

    const bookDoc = buildBookDoc(userId, meta);
    bookDoc.highlightCount = highlightsAll.length;
    bookDoc.momentCount = highlights.length + standaloneReviews.length;
    await db.upsertDoc('books', `${userId}_${meta.bookId}`, bookDoc);

    const docs = buildMomentDocs({
      userId,
      bookMeta: { ...meta, category: meta.category || (bm.book && bm.book.category) || '' },
      chapters: bm.chapters || [],
      highlights,
      standaloneReviews,
    });
    // 替换式写入：先清本书旧数据再批量插入（幂等，重跑/降级均无重复残留）
    await db.removeWhere('moments', { userId, bookId: meta.bookId });
    if (docs.length) await db.batchAddDocs('moments', docs);

    job.stats.highlightCount += highlightsAll.length;
    job.stats.reviewCount += reviews.length;
    job.stats.momentCount += docs.length;
    return { ok: true, momentCount: docs.length };
  } catch (e) {
    if (e instanceof BizError && e.code === ERR.UPSTREAM && /KEY/.test(e.message)) throw e;
    return { ok: false, error: (e && e.message) || 'unknown' };
  }
}

/** 拉书架 + 笔记本（并行），书籍概览批量入库，构建按笔记数降序的待处理书单 */
async function doFetchingShelf(client, job) {
  job.currentTask = '正在读取书架与笔记概览…';
  const [shelf, nb] = await Promise.all([client.shelfSync(), client.notebooksAll()]);
  const shelfBooks = shelf.books || [];
  job.stats.bookCount = shelfBooks.length + (shelf.albums || []).length + (shelf.mp && shelf.mp.show ? 1 : 0);
  const notebooks = nb.books || [];
  job.stats.notebookCount = notebooks.length;

  // 有笔记的书才需要采样划线/想法；笔记多的排前面优先深拉
  // 按 bookId 去重（上游 notebooks 偶发重复条目）
  const seen = new Set();
  const metas = notebooks
    .map((b) => ({
      bookId: b.bookId,
      title: (b.book && b.book.title) || '',
      author: (b.book && b.book.author) || '',
      cover: (b.book && b.book.cover) || '',
      category: (b.book && b.book.categories && b.book.categories[0] && b.book.categories[0].title) || '',
      noteCount: b.noteCount || 0,
      reviewCount: b.reviewCount || 0,
      bookmarkCount: b.bookmarkCount || 0,
      finished: Boolean((b.book && b.book.finished) || 0),
      readUpdateTime: b.sort || 0,
    }))
    .filter((m) => m.bookId && !seen.has(m.bookId) && seen.add(m.bookId))
    .sort((a, b) => b.noteCount - a.noteCount);

  // 书籍概览批量入库（remove-first + 批量 add，幂等）
  // _id 与 processOneBook 的 upsertDoc 保持一致（${userId}_${bookId}），
  // 否则采样覆盖时会另插一条 → 书单成对重复
  await db.removeWhere('books', { userId: job.userId });
  const bookDocs = metas.map((meta) => ({
    _id: `${job.userId}_${meta.bookId}`,
    ...buildBookDoc(job.userId, meta),
  }));
  if (bookDocs.length) await db.batchAddDocs('books', bookDocs);

  job.pendingBooks = metas;
  job.totalBooks = metas.length;
  job.stage = JOB_STAGE.BOOKS;
  job.progress = 10;
}

/** 分类聚合：按 moments 的固定大类生成 categories 集合 */
async function rebuildCategories(userId) {
  const moments = await db.fetchAll({
    name: 'moments',
    where: { userId },
    fields: { categoryId: true, categoryName: true },
    max: 5000,
  });
  const grouped = new Map();
  for (const m of moments) {
    if (!m.categoryId) continue;
    const g = grouped.get(m.categoryId) || { categoryId: m.categoryId, name: m.categoryName, momentCount: 0 };
    g.momentCount += 1;
    grouped.set(m.categoryId, g);
  }
  const items = [...grouped.values()].sort((a, b) => b.momentCount - a.momentCount);
  for (const item of items) {
    await db.upsertDoc('categories', `${userId}_${item.categoryId}`, { ...item, userId });
  }
  return items;
}

async function doFinalize(client, job) {
  job.currentTask = '正在汇总阅读统计…';
  try {
    const detail = await client.readDataDetail('overall');
    await db.upsertDoc('read_stats', `${job.userId}_overall`, {
      userId: job.userId,
      mode: 'overall',
      detail,
      createdAt: db.now(),
    });
  } catch (e) {
    /* 统计快照失败不阻断导入完成 */
  }

  job.currentTask = '正在整理分类…';
  await rebuildCategories(job.userId);

  await db.col('users').doc(job.userId).update({
    data: { lastSyncAt: db.now(), keyStatus: 'valid' },
  });

  job.stage = JOB_STAGE.DONE;
  job.progress = 100;
  job.currentTask = '导入完成';
  job.finishedAt = db.now();
}

/**
 * 推进一步（由 import_step 调用）：在软预算内循环处理，超时即断点返回。
 * 快速阶段只采样前 QUICK_SAMPLE_BOOKS 本（按 noteCount 降序），采完即 finalizing → done。
 */
async function advance(userId, opts = {}) {
  const budgetMs = Number(opts.budgetMs) || STEP_DEADLINE_MS;
  const { client } = await requireClient(userId);
  let job = await getJob(userId);
  if (!job) throw new BizError(ERR.NOT_FOUND, '没有进行中的导入任务，请先提交 KEY');
  if (job.stage === JOB_STAGE.DONE || job.stage === JOB_STAGE.FAILED) {
    return snapshot(job);
  }

  // 防并发：lease 在 25s 内视为有实例正在推进，本次只回状态
  const nowMs = Date.now();
  if (job.leaseAt && nowMs - job.leaseAt < 25000) {
    return snapshot(job);
  }
  job.leaseAt = nowMs;
  await saveJob(job);

  const deadline = nowMs + budgetMs;
  try {
    while (Date.now() < deadline) {
      if (job.stage === JOB_STAGE.VALIDATING || job.stage === JOB_STAGE.SHELF) {
        await doFetchingShelf(client, job);
        await saveJob(job);
      } else if (job.stage === JOB_STAGE.BOOKS) {
        const pending = job.pendingBooks || [];
        const sampleCount = Math.min(QUICK_SAMPLE_BOOKS, pending.length);
        if (job.bookIndex >= sampleCount) {
          // 采样完成 → 直接进收尾，剩余书由后台补齐
          job.sampleDone = true;
          job.stage = JOB_STAGE.FINALIZE;
          job.progress = 95;
          await saveJob(job);
          continue;
        }
        const meta = pending[job.bookIndex];
        job.currentTask = `正在读取《${meta.title}》的划线`;
        await saveJob(job);
        const r = await processOneBook(client, job, meta);
        if (!r.ok) {
          job.failedBooks.push({ bookId: meta.bookId, title: meta.title, error: r.error });
        }
        job.bookIndex += 1;
        const sampleTotal = sampleCount || 1;
        job.progress = 10 + Math.round(80 * (job.bookIndex / sampleTotal));
        await saveJob(job); // 每本书完成后立即断点
      } else if (job.stage === JOB_STAGE.FINALIZE) {
        await doFinalize(client, job);
        await saveJob(job);
        break;
      } else {
        break;
      }
    }
  } catch (e) {
    job.stage = JOB_STAGE.FAILED;
    job.error = (e && e.message) || '导入失败';
    await saveJob(job);
  }
  return snapshot(job);
}

async function finishBackfill(job) {
  job.importMode = 'backfilled';
  job.currentTask = '全量数据已补齐';
  await saveJob(job);
  await rebuildCategories(job.userId).catch(() => {});
}

/**
 * 后台补齐剩余书籍（由 analysis_step 顺手调用）：从 bookIndex 断点续推，
 * 4 本/组并行，budgetMs 内尽量多组；完成后重建分类并标记 importMode='backfilled'。
 * 任何失败静默返回（不影响分析），断点已落库，下次调用续推。
 */
async function backfill(userId, budgetMs = PIGGYBACK_BUDGET_MS) {
  try {
    const job = await getJob(userId);
    if (!job || job.importMode !== 'quick' || job.stage !== JOB_STAGE.DONE) return;
    const pending = job.pendingBooks || [];
    if (job.bookIndex >= pending.length) {
      // 快速阶段已覆盖全部书，只差补标记
      await finishBackfill(job);
      return;
    }
    // 防并发：与 advance 及其他 backfill 实例互斥
    const nowMs = Date.now();
    if (job.leaseAt && nowMs - job.leaseAt < 25000) return;
    job.leaseAt = nowMs;
    await saveJob(job);

    const { client } = await requireClient(userId);
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline && job.bookIndex < pending.length) {
      const group = pending.slice(job.bookIndex, job.bookIndex + BACKFILL_GROUP);
      const results = await Promise.all(group.map((meta) => processOneBook(client, job, meta)));
      results.forEach((r, i) => {
        if (!r.ok) {
          job.failedBooks.push({ bookId: group[i].bookId, title: group[i].title, error: r.error });
        }
      });
      job.bookIndex += group.length;
      await saveJob(job);
    }
    if (job.bookIndex >= pending.length) {
      await finishBackfill(job);
    }
  } catch (e) {
    // 补齐失败静默：不影响分析主流程
  }
}

module.exports = {
  JOB_STAGE,
  newJob,
  saveJob,
  getJob,
  requireClient,
  snapshot,
  advance,
  backfill,
  rebuildCategories,
  bookCategory,
};
