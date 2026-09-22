/**
 * 分享卡片 action：MVP 登记制。
 * imageUrl 由前端 canvas 生成后回传，服务端只登记并下发 sharePath。
 * 分享数据层级遵循 PRD 18：仅用户主动生成的卡片（L2）可被他人查看。
 */
const db = require('../lib/db');
const { BizError } = require('../lib/respond');
const { ERR } = require('../config');

const TITLE_TPL = {
  persona: 'NINA 发现了我的阅读人格',
  tag: 'NINA 发现了我身上的一个标签',
  topic: '我在 NINA 里沉淀了一个知识专题',
  moment: '我在 NINA 里留下了一个阅读瞬间',
  universe: '这是我的阅读宇宙',
};

async function createCard({ userId, params }) {
  const type = params.type;
  if (!TITLE_TPL[type]) {
    throw new BizError(ERR.BAD_PARAMS, 'type 必须是 persona | tag | topic | moment | universe');
  }
  let title = TITLE_TPL[type];
  // refId 存在时补充引用内容名
  const refId = params.refId || '';
  if (type === 'tag' && refId) {
    const tag = await db.getDoc('tags', `${userId}_${refId}`);
    if (tag) title = `NINA 发现了我身上的一个标签：${tag.name}`;
  } else if (type === 'topic' && refId) {
    const topic = await db.getDoc('topics', `${userId}_${refId}`);
    if (topic) title = `我在 NINA 里沉淀了一个知识专题：${topic.name}`;
  }

  const cardId = `sc_${Date.now().toString(36)}`;
  const doc = {
    _id: `${userId}_${cardId}`,
    userId,
    cardId,
    type,
    refId,
    imageUrl: params.imageUrl || '',
    title,
    sharePath: `/pages/home/index?fromShare=${cardId}`,
    createdAt: db.now(),
  };
  await db.upsertDoc('share_cards', doc._id, doc);

  return {
    cardId,
    imageUrl: doc.imageUrl,
    title,
    sharePath: doc.sharePath,
  };
}

module.exports = { createCard };
