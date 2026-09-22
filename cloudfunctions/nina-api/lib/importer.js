/**
 * 导入状态机：validating → fetching_shelf → fetching_books → finalizing → done
 *
 * 断点机制：import_jobs 文档（_id=userId）持久化 pendingBooks/bookIndex/stats，
 * 每处理完一本书立即 checkpoint（每本书是独立事务单元，moments _id=${userId}_${bookmarkId|reviewId} 幂等 upsert）。
 * 单次 import_step 在 9s 软预算（STEP_DEADLINE_MS）内循环推进，超时即返回，
 * 前端轮询 import_step 驱动续跑，可无限续跑不受单次调用超时限制。
 */
const db = require('./db');
const { WereadClient } = require('./weread');
const { matchCommentsToHighlights } = require('./matcher');
const { getUserKey } = require('./user');
const { BizError } = require('./respond');
const { ERR, STEP_DEADLINE_MS } = require('../config');

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
    progress: 0,
    currentTask: '',
    error: null,
    stats: { bookCount: 0, notebookCount: 0, momentCount: 0, highlightCount: 0, reviewCount: 0 },
    pendingBooks: [],
    bookIndex: 0,
    totalBooks: 0,
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

/** 处理单本书：独立事务单元，任何非 Key 异常只影响本书（进 failedBooks） */
async function processOneBook(client, job, meta) {
  const userId = job.userId;
  try {
    const bm = await client.bookmarkList(meta.bookId);
    const reviews = await client.reviewListMineAll(meta.bookId);
    const { highlights, standaloneReviews } = matchCommentsToHighlights(bm.updated || [], reviews);

    // 阅读进度（尽力而为）
    let progressInfo = null;
    try {
      const p = await client.getProgress(meta.bookId);
      progressInfo = p.book || null;
    } catch (e) {
      /* 进度拿不到不影响导入 */
    }

    const bookDoc = {
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
      highlightCount: (bm.updated || []).length,
      momentCount: highlights.length + standaloneReviews.length,
      progress: progressInfo ? progressInfo.progress : 0,
      readingTime: progressInfo ? progressInfo.readingTime : 0,
      startReadingTime: progressInfo ? progressInfo.startReadingTime : 0,
    };
    await db.upsertDoc('books', `${userId}_${meta.bookId}`, bookDoc);

    const docs = buildMomentDocs({
      userId,
      bookMeta: { ...meta, category: meta.category || (bm.book && bm.book.category) || '' },
      chapters: bm.chapters || [],
      highlights,
      standaloneReviews,
    });
    for (const doc of docs) {
      const { _id, ...data } = doc;
      await db.upsertDoc('moments', _id, data);
    }

    job.stats.highlightCount += (bm.updated || []).length;
    job.stats.reviewCount += reviews.length;
    job.stats.momentCount += docs.length;
    return { ok: true, momentCount: docs.length };
  } catch (e) {
    if (e instanceof BizError && e.code === ERR.UPSTREAM && /KEY/.test(e.message)) throw e;
    return { ok: false, error: (e && e.message) || 'unknown' };
  }
}

/** 拉书架 + 笔记本，构建待处理书单 */
async function doFetchingShelf(client, job) {
  job.currentTask = '正在读取书架…';
  const shelf = await client.shelfSync();
  const shelfBooks = shelf.books || [];
  job.stats.bookCount = shelfBooks.length + (shelf.albums || []).length + (shelf.mp && shelf.mp.show ? 1 : 0);

  job.currentTask = '正在读取笔记本列表…';
  const nb = await client.notebooksAll();
  const notebooks = nb.books || [];
  job.stats.notebookCount = notebooks.length;

  // 有笔记的书才需要逐本拉划线/想法
  job.pendingBooks = notebooks.map((b) => ({
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
  }));
  job.totalBooks = job.pendingBooks.length;
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
 */
async function advance(userId) {
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

  const deadline = nowMs + STEP_DEADLINE_MS;
  try {
    while (Date.now() < deadline) {
      if (job.stage === JOB_STAGE.VALIDATING || job.stage === JOB_STAGE.SHELF) {
        await doFetchingShelf(client, job);
        await saveJob(job);
      } else if (job.stage === JOB_STAGE.BOOKS) {
        const pending = job.pendingBooks || [];
        if (job.bookIndex >= pending.length) {
          job.stage = JOB_STAGE.FINALIZE;
          job.progress = 95;
          await saveJob(job);
          continue;
        }
        const meta = pending[job.bookIndex];
        job.currentTask = `正在读取《${meta.title}》的划线`;
        await saveJob(job);
        const r = await processOneBook(client, job, meta);
        if (r.ok) {
          job.bookIndex += 1;
        } else {
          job.failedBooks.push({ bookId: meta.bookId, title: meta.title, error: r.error });
          job.bookIndex += 1;
        }
        const total = job.totalBooks || 1;
        job.progress = 10 + Math.round(80 * (job.bookIndex / total));
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

module.exports = {
  JOB_STAGE,
  newJob,
  saveJob,
  getJob,
  requireClient,
  snapshot,
  advance,
  rebuildCategories,
  bookCategory,
};
