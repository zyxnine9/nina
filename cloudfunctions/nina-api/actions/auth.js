/**
 * 认证 actions：auth_login / user_profile。
 * 身份 = OPENID（云函数自动注入），users 文档与 Key 逻辑在 lib/user。
 */
const db = require('../lib/db');
const { ensureUser, keyHintOf } = require('../lib/user');
const { BizError } = require('../lib/respond');
const { ERR } = require('../config');

async function login({ userId }) {
  let isNewUser = false;
  const existing = await db.getDoc('users', userId);
  if (!existing) isNewUser = true;
  await ensureUser(userId);
  return { userId, isNewUser };
}

async function profile({ userId }) {
  const user = await ensureUser(userId);
  const [bookCount, momentCount, keyHint] = await Promise.all([
    db.countOf('books', { userId }),
    db.countOf('moments', { userId }),
    keyHintOf(user),
  ]);
  const analysis = await db.getDoc('analyses', userId);
  return {
    userId,
    nickname: user.nickname || 'NINA 用户',
    avatar: user.avatar || '',
    hasKey: Boolean(user.keyEnc),
    keyStatus: user.keyStatus || 'none',
    keyHint,
    keyUpdatedAt: user.keyUpdatedAt || 0,
    lastSyncAt: user.lastSyncAt || 0,
    stats: {
      bookCount,
      momentCount,
      analysisAt: (analysis && analysis.finishedAt) || 0,
    },
  };
}

/** 更新头像/昵称（微信头像昵称填写能力），字段均可选但至少传一个 */
async function updateProfile({ userId, params }) {
  const p = params || {};
  const patch = {};

  const nickname = typeof p.nickname === 'string' ? p.nickname.trim() : '';
  if (nickname) {
    if (nickname.length > 24) {
      throw new BizError(ERR.BAD_PARAMS, '昵称最长 24 个字');
    }
    patch.nickname = nickname;
  }

  const avatar = typeof p.avatar === 'string' ? p.avatar.trim() : '';
  if (avatar) {
    if (avatar.length > 255) {
      throw new BizError(ERR.BAD_PARAMS, 'avatar 不合法');
    }
    patch.avatar = avatar;
  }

  if (!Object.keys(patch).length) {
    throw new BizError(ERR.BAD_PARAMS, '无可更新的字段');
  }

  await ensureUser(userId);
  patch.updatedAt = db.now();
  await db.col('users').doc(userId).update({ data: patch });
  return { nickname: patch.nickname, avatar: patch.avatar };
}

module.exports = { login, profile, updateProfile };
