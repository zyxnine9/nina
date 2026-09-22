/**
 * 云数据库工具：upsert（确定性 _id 幂等写入）、游标分页、userId 强制过滤。
 * 约定：客户端一律不可直接访问集合，隔离完全靠 userId 字段 + 本模块封装。
 */
const now = () => Math.floor(Date.now() / 1000);

function col(name) {
  return db().collection(name);
}

// cloud 由 router 注入到全局，避免每个文件重复 require
let _db = null;
function init(cloud) {
  _db = cloud.database();
}
function db() {
  if (!_db) throw new Error('db 未初始化，请先调用 db.init(cloud)');
  return _db;
}

/** 幂等 upsert：_id 存在则覆盖 data，不存在则创建 */
async function upsertDoc(name, id, data) {
  await col(name).doc(id).set({ data: { ...data, updatedAt: now() } });
}

/** 读取单文档，不存在返回 null */
async function getDoc(name, id) {
  try {
    const res = await col(name).doc(id).get();
    return res.data || null;
  } catch (e) {
    return null;
  }
}

/** 解析分页游标（offset 编码，追加型数据足够可靠） */
function decodeCursor(cursor) {
  if (!cursor) return { skip: 0 };
  try {
    const obj = JSON.parse(Buffer.from(String(cursor), 'base64').toString('utf8'));
    return { skip: Math.max(0, Number(obj.s) || 0) };
  } catch (e) {
    return { skip: 0 };
  }
}

function encodeCursor(skip) {
  return Buffer.from(JSON.stringify({ s: skip })).toString('base64');
}

/**
 * 游标分页查询。where 必须含 userId（由调用方保证），此处再强制兜底。
 * 返回 { items, nextCursor }，nextCursor=null 表示没有更多。
 */
async function paginate({
  name,
  where = {},
  userId,
  orderBy = 'createdAt',
  order = 'desc',
  cursor,
  limit = 20,
  maxLimit = 100,
}) {
  const { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } = require('../config');
  const size = Math.min(Math.max(1, Number(limit) || PAGE_SIZE_DEFAULT), maxLimit || PAGE_SIZE_MAX);
  const { skip } = decodeCursor(cursor);
  const query = { ...where, userId };
  let q = col(name).where(query).orderBy(orderBy, order === 'asc' ? 'asc' : 'desc');
  if (orderBy !== '_id') q = q.orderBy('_id', order === 'asc' ? 'asc' : 'desc');
  const res = await q.skip(skip).limit(size + 1).get();
  const rows = res.data || [];
  const hasMore = rows.length > size;
  const items = hasMore ? rows.slice(0, size) : rows;
  return { items, nextCursor: hasMore ? encodeCursor(skip + size) : null };
}

/** 带过滤的计数 */
async function countOf(name, where = {}) {
  const res = await col(name).where(where).count();
  return res.total || 0;
}

/** 全量拉取（上限 max 条），供分析管道扫描 moments 用 */
async function fetchAll({ name, where = {}, fields, max = 3000 }) {
  const out = [];
  const BATCH = 100;
  while (out.length < max) {
    let q = col(name).where(where);
    if (fields) q = q.field(fields);
    const res = await q.skip(out.length).limit(Math.min(BATCH, max - out.length)).get();
    const rows = res.data || [];
    out.push(...rows);
    if (rows.length < BATCH) break;
  }
  return out;
}

module.exports = { init, db, col, now, upsertDoc, getDoc, paginate, countOf, fetchAll, encodeCursor, decodeCursor };
