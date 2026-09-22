/**
 * 导入 actions：
 * - import_key：试调 /shelf/sync 验 Key，通过后建导入 job（Key 只存库，不下发）
 * - import_status：导入进度
 * - import_step：轮询推进（断点续跑）
 * - import_sync：增量同步（书架对比 readUpdateTime 找变化书 + removed 删档）
 */
const db = require('../lib/db');
const { WereadClient } = require('../lib/weread');
const importer = require('../lib/importer');
const { BizError } = require('../lib/respond');
const { ERR } = require('../config');
const { ensureUser } = require('../lib/user');

/** 提交 KEY：校验有效性 → 存库 → 建/重置导入任务 */
async function importKey({ userId, params }) {
  const key = String((params && params.key) || '').trim();
  if (!/^wrk-/.test(key)) {
    throw new BizError(ERR.BAD_PARAMS, 'KEY 格式不正确（应以 wrk- 开头）');
  }
  await ensureUser(userId);

  // 试调 /shelf/sync 验证 Key
  const client = new WereadClient(key);
  let shelf;
  try {
    shelf = await client.shelfSync();
  } catch (e) {
    await db.col('users').doc(userId).update({ data: { keyStatus: 'expired' } }).catch(() => {});
    throw new BizError(ERR.UPSTREAM, 'KEY 无效或已过期');
  }

  await db.col('users').doc(userId).update({
    data: {
      keyEnc: Buffer.from(key, 'utf8').toString('base64'),
      keyStatus: 'valid',
      keyUpdatedAt: db.now(),
    },
  });

  // 重置导入任务
  const job = importer.newJob(userId);
  job.stage = importer.JOB_STAGE.SHELF;
  job.currentTask = 'KEY 校验通过，开始导入…';
  await importer.saveJob(job);

  return { importId: userId, accepted: true, bookCount: (shelf.books || []).length };
}

/** 导入进度（不传参返回最近一次） */
async function importStatus({ userId }) {
  const job = await importer.getJob(userId);
  if (!job) {
    throw new BizError(ERR.NOT_FOUND, '暂无导入任务');
  }
  return importer.snapshot(job);
}

/** 轮询推进一步 */
async function importStep({ userId }) {
  return importer.advance(userId);
}

/** 增量同步 */
async function importSync({ userId }) {
  const { client } = await importer.requireClient(userId);

  // 书架全量（上游无增量参数，成本低）
  const shelf = await client.shelfSync();
  const shelfBooks = shelf.books || [];
  const shelfMap = new Map(shelfBooks.map((b) => [b.bookId, b]));

  const stored = await db.fetchAll({
    name: 'books',
    where: { userId },
    fields: { bookId: true, lastReadAt: true, title: true },
    max: 3000,
  });
  const storedMap = new Map(stored.map((b) => [b.bookId, b]));

  // 书架对比 readUpdateTime 找变化书
  const changedBookIds = [];
  for (const b of shelfBooks) {
    const s = storedMap.get(b.bookId);
    if (!s || (b.readUpdateTime || 0) > (s.lastReadAt || 0)) changedBookIds.push(b.bookId);
  }

  // 书架已删除的书 → 删档（book + moments）
  const removedBookIds = stored.filter((b) => !shelfMap.has(b.bookId)).map((b) => b.bookId);
  for (const bookId of removedBookIds) {
    await db.col('books').doc(`${userId}_${bookId}`).remove().catch(() => {});
    await db.col('moments').where({ userId, bookId }).remove().catch(() => {});
  }

  // 有笔记的变化书单（用于逐本重拉划线/想法）
  let pendingBooks = [];
  if (changedBookIds.length) {
    const nb = await client.notebooksAll();
    const nbMap = new Map((nb.books || []).map((b) => [b.bookId, b]));
    pendingBooks = changedBookIds
      .filter((bookId) => nbMap.has(bookId))
      .map((bookId) => {
        const b = nbMap.get(bookId);
        return {
          bookId,
          title: (b.book && b.book.title) || '',
          author: (b.book && b.book.author) || '',
          cover: (b.book && b.book.cover) || '',
          category: (b.book && b.book.categories && b.book.categories[0] && b.book.categories[0].title) || '',
          noteCount: b.noteCount || 0,
          reviewCount: b.reviewCount || 0,
          bookmarkCount: b.bookmarkCount || 0,
          finished: Boolean((b.book && b.book.finished) || 0),
          readUpdateTime: b.sort || 0,
        };
      });
  }

  // 重置 job 进入 fetching_books
  const job = importer.newJob(userId);
  job.stage = importer.JOB_STAGE.BOOKS;
  job.stats.bookCount = shelfBooks.length;
  job.pendingBooks = pendingBooks;
  job.totalBooks = pendingBooks.length;
  job.currentTask = `增量同步：${pendingBooks.length} 本变化`;
  await importer.saveJob(job);

  return {
    syncId: userId,
    changedBookCount: pendingBooks.length,
    removedCount: removedBookIds.length,
  };
}

module.exports = { importKey, importStatus, importStep, importSync };
