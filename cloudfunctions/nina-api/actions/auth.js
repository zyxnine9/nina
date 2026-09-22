/**
 * 认证 actions：auth_login / user_profile。
 * 身份 = OPENID（云函数自动注入），users 文档与 Key 逻辑在 lib/user。
 */
const db = require('../lib/db');
const { ensureUser } = require('../lib/user');

async function login({ userId }) {
  let isNewUser = false;
  const existing = await db.getDoc('users', userId);
  if (!existing) isNewUser = true;
  await ensureUser(userId);
  return { userId, isNewUser };
}

async function profile({ userId }) {
  const user = await ensureUser(userId);
  const [bookCount, momentCount] = await Promise.all([
    db.countOf('books', { userId }),
    db.countOf('moments', { userId }),
  ]);
  const analysis = await db.getDoc('analyses', userId);
  return {
    userId,
    nickname: user.nickname || 'NINA 用户',
    avatar: user.avatar || '',
    hasKey: Boolean(user.keyEnc),
    keyStatus: user.keyStatus || 'none',
    lastSyncAt: user.lastSyncAt || 0,
    stats: {
      bookCount,
      momentCount,
      analysisAt: (analysis && analysis.finishedAt) || 0,
    },
  };
}

module.exports = { login, profile };
