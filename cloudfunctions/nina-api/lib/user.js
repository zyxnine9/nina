/**
 * 用户域公共逻辑：users 文档（_id=userId）读写 + 微信读书 Key 解码。
 * 从 actions/auth.js 下沉，供 auth / importer / analyzer 等 lib 复用。
 */
const db = require('./db');

/** 确保 users 文档存在，返回用户文档 */
async function ensureUser(userId) {
  let user = await db.getDoc('users', userId);
  if (!user) {
    const doc = {
      userId,
      nickname: '',
      avatar: '',
      keyEnc: '',
      keyStatus: 'none', // valid | expired | none
      keyUpdatedAt: 0,
      lastSyncAt: 0,
      createdAt: db.now(),
    };
    await db.upsertDoc('users', userId, doc);
    user = doc;
  }
  return user;
}

/** 读取用户微信读书 Key（base64 存储，仅云函数内部使用，永不下发前端） */
async function getUserKey(user) {
  if (!user || !user.keyEnc) return '';
  try {
    return Buffer.from(user.keyEnc, 'base64').toString('utf8');
  } catch (e) {
    return '';
  }
}

module.exports = { ensureUser, getUserKey };
