# 微信读书 Agent API 文档

> 适用项目：NINA（AI 驱动的个人阅读与自我探索工具）
> 数据来源：微信读书官方 Agent Skills 开放接口
> 文档版本：v1.0（2026-09-20，基于实际请求验证）

---

## 1. 概述

微信读书官方为 AI Agent 提供了一组只读接口，通过统一网关访问，可获取用户的**书架、书籍信息、章节目录、阅读进度、划线、想法/评论、阅读统计、推荐**等数据。这是 NINA 实现「KEY 数据导入 → 阅读瞬间 → AI 分析」链路的数据基础。

**能力边界：**
- 仅读取/查询，**无写操作**
- 划线和想法可以导出全文；**书签只有数量，内容不可导出**
- API Key 绑定用户身份（vid），需要用户身份的接口自动注入，无需手动传 vid

---

## 2. 通用调用规范

### 2.1 统一入口与鉴权

```
POST https://i.weread.qq.com/api/agent/gateway
```

| Header | 值 | 说明 |
|---|---|---|
| `Authorization` | `Bearer wrk-xxxxxxxx` | API Key，从微信读书 App（≥10.1.1）配置页 `weread.qq.com/r/weread-skills` 扫码生成 |
| `Content-Type` | `application/json` | 固定 |

**⚠️ 安全提示：API Key 等同于用户身份凭证，严禁提交到代码仓库或写入前端代码，应保存在服务端（如云函数环境变量）。**

### 2.2 请求格式

- Method：`POST`，Body 为 JSON
- `api_name` 指定接口，**业务参数平铺在 body 顶层**（不要包在 `params`/`data` 里，否则会被忽略）
- **每次请求必须带 `skill_version`**

```bash
curl -X POST "https://i.weread.qq.com/api/agent/gateway" \
  -H "Authorization: Bearer $WEREAD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"api_name": "/store/search", "keyword": "三体", "count": 10, "skill_version": "1.0.4"}'
```

### 2.3 响应格式

- JSON。业务数据直接在顶层（无统一包裹层）
- `errcode` 非 0 表示错误
- 回包经过字段裁剪，只返回核心字段
- 发送 `{"api_name": "/_list"}` 可查看所有可用接口及参数定义

### 2.4 通用约定

| 约定 | 说明 |
|---|---|
| 时间戳 | 所有 Unix 时间戳（`updateTime`、`createTime`、`finishTime` 等）单位为**秒** |
| 阅读时长 | 单位为**秒**（如 `readTime`、`totalReadTime`） |
| 评分 | `newRating` 为千分制（930 = 9.3 分），`newRatingDetail.title` 为评级文案（如"神作"） |
| 分页 | 两种模式：`maxIdx` 偏移量（搜索/推荐类）、`synckey`/`lastSort` 游标（列表/笔记类），见各接口说明 |
| 深度链接 | 回包中的 `deepLink` 为 `weread://` 深链或 https 链接，可直接用于跳转微信读书 |

### 2.5 接口总览

| # | api_name | 说明 | 需登录 |
|---|---|---|---|
| 1 | `/store/search` | 搜索书籍/作者/书单等 | ✅ |
| 2 | `/book/info` | 书籍基本信息 | ❌ |
| 3 | `/book/chapterinfo` | 书籍章节目录 | ❌ |
| 4 | `/shelf/sync` | 用户书架 | ✅ |
| 5 | `/book/getprogress` | 用户对某本书的阅读进度 | ✅ |
| 6 | `/user/notebooks` | 用户所有有笔记的书籍概览 | ✅ |
| 7 | `/book/bookmarklist` | 用户对某本书的划线列表 | ✅ |
| 8 | `/review/list/mine` | 用户在某本书上的个人想法 | ✅ |
| 9 | `/review/single` | 单条想法详情（含评论/点赞） | ✅ |
| 10 | `/book/readreviews` | 章节中某些划线范围下的想法列表 | ✅ |
| 11 | `/book/bestbookmarks` | 某本书的热门划线 | ✅ |
| 12 | `/book/underlines` | 某本书某章节的划线热度统计 | ✅ |
| 13 | `/review/list` | 某本书的公开点评 | ✅ |
| 14 | `/readdata/detail` | 用户阅读统计（周/月/年/总） | ✅ |
| 15 | `/book/recommend` | 个性化推荐书籍 | ✅ |
| 16 | `/book/similar` | 与某本书相似的推荐 | ✅ |
| 17 | `/discover/interact/type3` | 发现页「朋友在读」动态 | ✅ |

---

## 3. 接口详情

### 3.1 `/store/search` — 搜索书籍

在书城搜索书籍/作者/书单/听书/公众号/文章/全文，通过 `scope` 切换搜索 tab。

**入参：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `keyword` | string | ✅ | - | 搜索关键词 |
| `scope` | int | ❌ | 10 | 搜索类型：0=全部, 10=电子书, 14=微信听书, 6=作者, 12=全文, 13=书单, 2=公众号, 4=文章 |
| `maxIdx` | int | ❌ | 0 | 翻页偏移 |
| `count` | int | ❌ | 15 | 每页数量 |

**返回：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `sid` | string | 本次搜索会话 ID |
| `hasMore` | int | 是否还有下一页 |
| `results` | array | 按搜索类型分组的结果，每组含 `title`（分组名）和 `books[]` |

`books[]` 单项结构：

```json
{
  "searchIdx": 1,
  "bookInfo": {
    "bookId": "695233",
    "deepLink": "https://weread.qq.com/book-detail?...",
    "title": "三体全集（全三册）",
    "author": "刘慈欣",
    "translator": "",
    "cover": "https://cdn.weread.qq.com/...",
    "payType": 4097,
    "type": 0,
    "soldout": 0,
    "newRatingDetail": { "title": "神作" },
    "newRatingCount": 295313,
    "newRating": 930
  },
  "readingCount": 10498
}
```

---

### 3.2 `/book/info` — 书籍基本信息

获取书名、作者、简介、分类、出版社、评分等。**无需登录**。

**入参：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `bookId` | string | ✅ | 书籍 ID |

**返回（实测示例，节选）：**

```json
{
  "bookId": "924389",
  "deepLink": "https://weread.qq.com/book-detail?...",
  "title": "失明症漫记（罗翔推荐）",
  "author": "若泽·萨拉马戈",
  "translator": "范维信",
  "cover": "https://cdn.weread.qq.com/...",
  "intro": "诺奖得主萨拉马戈传世之作！……",
  "category": "精品小说-社会小说",
  "publisher": "河南文艺出版社",
  "publishTime": "2022-08-19 00:00:00",
  "isbn": "9787555913689",
  "wordCount": null,
  "newRating": 853,
  "newRatingCount": 14557,
  "newRatingDetail": { "title": "好评如潮" }
}
```

| 字段 | 说明 |
|---|---|
| `intro` | 书籍简介（长文本） |
| `category` | 一级分类-二级分类 |
| `newRating` | 千分制评分 |
| `wordCount` | 字数，可能为 null |

---

### 3.3 `/book/chapterinfo` — 章节目录

获取书籍的章节列表。**无需登录**。划线/想法接口中的 `chapterUid` 均从此处获取。

**入参：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `bookId` | string | ✅ | 书籍 ID |

**返回：**

```json
{
  "bookId": "3300113465",
  "synckey": 1661983536,
  "chapterUpdateTime": 1789017454,
  "chapters": [
    {
      "chapterUid": 1,
      "chapterIdx": 1,
      "updateTime": 1725005424,
      "level": 1,
      "title": "封面",
      "wordCount": 1,
      "price": 0,
      "isMPChapter": 0,
      "paid": 0
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `chapters[].chapterUid` | 章节 UID，其他接口引用此 ID |
| `chapters[].chapterIdx` | 章节序号 |
| `chapters[].level` | 目录层级（1=一级标题） |

---

### 3.4 `/shelf/sync` — 用户书架

获取用户书架全部条目（含电子书、听书/讲书专辑、公众号文章收藏）。**NINA 数据导入的起点。**

**入参：** 无

**返回：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `books` | array | 书架中的书 |
| `archive` | array | 书架分组（文件夹），实测为空数组 |
| `albums` | array | 专辑/有声书 |
| `mp` | object/null | 公众号文章收藏；`mp.show=1` 且含 `mp.book`（固定 `bookId: "mpbook"`） |

> **计数口径**：回答"书架有多少本"时 = `books.length + albums.length + (mp 非空 ? 1 : 0)`

`books[]` 单项结构（实测示例，节选）：

```json
{
  "bookId": "40726681",
  "deepLink": "https://weread.qq.com/book-detail?...",
  "title": "焦虑的人",
  "author": "弗雷德里克·巴克曼",
  "updateTime": 1789017454,
  "cover": "https://cdn.weread.qq.com/...",
  "finishReading": 0,
  "readUpdateTime": 1786277457,
  "secret": 0,
  "category": "精品小说-社会小说"
}
```

| 字段 | 说明 |
|---|---|
| `finishReading` | 是否读完 |
| `readUpdateTime` | 最近阅读时间戳（可用于判断"最近在读"） |
| `secret` | 是否私密阅读 |
| `updateTime` | 条目更新时间 |

---

### 3.5 `/book/getprogress` — 阅读进度

获取用户对某本书的阅读进度、在该书上的累计阅读时长。

**入参：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `bookId` | string | ✅ | 书籍 ID |

**返回（实测示例）：**

```json
{
  "bookId": "924389",
  "book": {
    "appId": "88986073",
    "bookVersion": 395242268,
    "chapterUid": 42,
    "chapterOffset": 10354,
    "chapterIdx": 5,
    "updateTime": 1725378959,
    "synckey": 1057598762,
    "summary": "了，看得见了。他疯了似的拥抱妻子，随后又",
    "readingTime": 47553,
    "progress": 96,
    "isStartReading": 1,
    "ttsTime": 12774,
    "startReadingTime": 1706889128,
    "recordReadingTime": 0
  },
  "timestamp": 1789891189
}
```

| 字段 | 说明 |
|---|---|
| `book.progress` | 阅读进度百分比（0-100） |
| `book.readingTime` | 在该书上的累计阅读时长（秒） |
| `book.summary` | 当前阅读位置附近的正文摘要 |
| `book.startReadingTime` | 开始阅读的时间戳 |
| `book.ttsTime` | 听书时长（秒） |

---

### 3.6 `/user/notebooks` — 笔记本概览

获取用户所有**有笔记的书籍列表**，含每本书的划线数/想法数。**NINA 获取"阅读瞬间"的第二步**（先拿到书单，再逐本拉取划线和想法）。

**入参：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `count` | int | ❌ | 20 | 每页数量（实测可传 100） |
| `lastSort` | int | ❌ | - | 翻页游标，传上一页最后一条的 `sort` 值 |

**返回：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `synckey` | int | 同步游标 |
| `totalBookCount` | int | 有笔记的书总数量 |
| `totalNoteCount` | int | 笔记总数（划线+想法） |
| `noBookReviewCount` | int | 相关计数 |
| `hasMore` | int | 是否还有下一页 |
| `books` | array | 笔记本列表 |

`books[]` 单项结构（实测示例，节选）：

```json
{
  "bookId": "3300113465",
  "book": {
    "bookId": "3300113465",
    "title": "了凡四训详解",
    "author": "[明]袁了凡著 费勇编著",
    "cover": "https://cdn.weread.qq.com/...",
    "categories": [{ "categoryId": 600000, "subCategoryId": 600001, "title": "哲学宗教-东方哲学" }],
    "finished": 1,
    "format": "epub"
  },
  "reviewCount": 0,
  "markedStatus": 1,
  "readingProgress": 0,
  "noteCount": 1,
  "bookmarkCount": 0,
  "sort": 1789734544
}
```

| 字段 | 说明 |
|---|---|
| `noteCount` | 该书划线数 |
| `reviewCount` | 该书想法/点评数 |
| `bookmarkCount` | 书签数（**只有数量，内容不可导出**） |
| `sort` | 排序值，翻页时作为下一页的 `lastSort` |

---

### 3.7 `/book/bookmarklist` — 用户划线列表 ⭐

获取用户对某本书的**全部划线**（含划线原文）。**这是 NINA「阅读瞬间」最核心的数据源。**

**入参：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `bookId` | string | ✅ | 书籍 ID |

**返回（实测示例，节选）：**

```json
{
  "synckey": 1717480913,
  "updated": [
    {
      "bookId": "924389",
      "chapterUid": 42,
      "bookmarkId": "924389_42_12705-12743",
      "colorStyle": 5,
      "type": 1,
      "createTime": 1717480913,
      "range": "12705-12743",
      "markText": "我想我们没有失明，我想我们本来是盲人；能看得见的盲人；能看但又看不见的盲人。"
    }
  ],
  "removed": [],
  "chapters": [
    { "title": "17", "chapterUid": 42, "chapterIdx": 21 }
  ],
  "book": {
    "bookId": "924389",
    "title": "失明症漫记（罗翔推荐）",
    "author": "若泽·萨拉马戈",
    "cover": "https://cdn.weread.qq.com/..."
  }
}
```

| 字段 | 说明 |
|---|---|
| `updated` | 划线数组（一次性返回该书全部划线） |
| `updated[].markText` | **划线原文** |
| `updated[].createTime` | 划线时间戳（"阅读瞬间"的发生时间） |
| `updated[].chapterUid` | 所在章节，配合 `chapters[]` 得到章节标题 |
| `updated[].range` | 书内字符偏移范围 `start-end`（可与想法的 range 关联） |
| `updated[].colorStyle` | 划线颜色样式 |
| `updated[].type` | 划线类型（1=划线） |
| `chapters` | 该书涉及章节的 `{title, chapterUid, chapterIdx}` 映射 |
| `removed` | 已删除的划线 ID（增量同步用） |

---

### 3.8 `/review/list/mine` — 我的个人想法

获取用户在某本书上的**个人想法/点评**（划线下写的评论），即「阅读瞬间」的评论部分。

**入参：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `bookid` | string | ✅ | - | 书籍 ID（**注意是小写 `bookid`**） |
| `synckey` | int | ❌ | 0 | 翻页游标 |
| `count` | int | ❌ | 20 | 每页数量 |

**返回（实测示例，节选）：**

```json
{
  "totalCount": 13,
  "hasMore": 0,
  "synckey": 1756091588,
  "removed": [],
  "reviews": [
    {
      "reviewId": "39003070_7RGiS310P",
      "commentsCount": 1,
      "likesCount": 0,
      "review": {
        "bookId": "924389",
        "content": "老牛吃嫩草啊…",
        "abstract": "从此我和你就像一对夫妇一样一起生活",
        "range": "8332-8349",
        "type": 1,
        "chapterUid": 41,
        "chapterIdx": 20,
        "chapterTitle": "16",
        "reviewId": "39003070_7RGiS310P",
        "userVid": 39003070,
        "createTime": 1717429212,
        "flag": 0,
        "isLike": 0,
        "topics": [],
        "book": { "bookId": "924389", "title": "失明症漫记（罗翔推荐）", "author": "若泽·萨拉马戈", "cover": "..." },
        "author": { "userVid": 39003070, "name": "Good_Nine9", "avatar": "https://..." }
      }
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `reviews[].review.content` | **想法正文**（用户写的评论） |
| `reviews[].review.abstract` | 想法对应的**原文摘录**（被划线/选中的句子） |
| `reviews[].review.range` | 字符偏移范围，可与划线 `range` 关联 |
| `reviews[].review.createTime` | 想法创建时间戳 |
| `reviews[].review.chapterTitle` | 所在章节标题 |

---

### 3.9 `/review/single` — 单条想法详情

获取单条想法/评论的详情，含其下评论列表和点赞信息。

**入参：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `reviewId` | string | ✅ | - | 想法/评论 ID（来自 3.8 的 `reviewId`） |
| `commentsCount` | int | ❌ | 10 | 拉取评论数量 |
| `commentsDirection` | int | ❌ | 1 | 评论排序：0=倒序, 1=正序 |
| `likesCount` | int | ❌ | 10 | 拉取点赞数量 |
| `likesDirection` | int | ❌ | 0 | 点赞排序：0=倒序 |
| `synckey` | int | ❌ | 0 | 增量同步 key |

**返回字段：** `reviewId`、`review`（结构同 3.8）、`synckey`、`htmlContent`（HTML 渲染内容）、`bookReviewCount`

---

### 3.10 `/book/readreviews` — 章节划线范围下的想法

获取某章节中**指定划线范围**下的（公开）想法/评论列表，每个划线最多 20 条。

**入参：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `bookId` | string | ✅ | 书籍 ID |
| `chapterUid` | int | ✅ | 章节 UID |
| `reviews` | array | ✅ | 划线范围数组，每项含 `{range, maxIdx, count, synckey}`（`range` 来自划线的 `range` 字段） |

**返回字段：** `bookId`、`chapterUid`、`reviews`（每个范围下对应数组）

> 用途：查看"我的划线下面别人写了什么想法"，可作社交视角的补充。

---

### 3.11 `/book/bestbookmarks` — 热门划线

获取某本书的**热门划线列表**（含划线文本和划线人数），按热度排序，最多 20 条。

**入参：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `bookId` | string | ✅ | - | 书籍 ID |
| `chapterUid` | int | ❌ | 0 | 章节 UID（0=全部章节） |
| `synckey` | int | ❌ | 0 | 增量同步 key |

**返回字段：** `synckey`、`totalCount`、`items`（含划线文本与人数）、`chapters`

> 用途：对比"我的划线 vs 大众热门划线"，可作个性化分析信号（用户划了哪些非热门句子）。

---

### 3.12 `/book/underlines` — 划线热度统计

获取某本书某章节的划线热度统计（每条划线的人数/得分/类型），**不含划线文本**。

**入参：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `bookId` | string | ✅ | - | 书籍 ID |
| `chapterUid` | int | ✅ | - | 章节 UID |
| `synckey` | int | ❌ | 0 | 增量同步 key |

**返回字段：** `bookId`、`chapterUid`、`underlines`（数组：人数/得分/类型）、`synckey`

---

### 3.13 `/review/list` — 书籍公开点评

获取某本书的公开点评/想法（全站用户的，非仅本人）。

**入参：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `bookId` | string | ✅ | - | 书籍 ID |
| `reviewListType` | int | ❌ | 0 | 筛选：0=全部, 1=推荐, 2=不行, 3=最新, 4=一般 |
| `count` | int | ❌ | 20 | 每页数量 |
| `maxIdx` | int | ❌ | 0 | 翻页偏移 |
| `synckey` | int | ❌ | 0 | 翻页游标 |

**返回字段：** `synckey`、`reviews`、`reviewsHasMore`、`reviewsHas5Star`、`reviewsHas1Star`、`reviewsHasRecent`、`reviewsCnt`（点评总数）、`recentTotalCnt`、`friendCommentCount`（好友点评数）、`friendCommentUsers`、`deepVRecommendInfo` 等

---

### 3.14 `/readdata/detail` — 阅读统计 ⭐

获取用户阅读统计数据，支持周/月/年/总四个维度，以及传历史时间戳查看历史周期。

**入参：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `mode` | string | ❌ | monthly | 统计维度：`weekly`=本周, `monthly`=本月, `annually`=本年, `overall`=总计 |
| `baseTime` | int | ❌ | 0 | 基准时间戳（0=当前周期；传历史时间戳可查历史周期数据） |

**返回（实测 `overall`，节选）：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `totalReadTime` | int | 总阅读时长（秒） |
| `readDays` | int | 累计阅读天数（实测 762） |
| `readTimes` | object | 按年度的阅读时长分布，key 为年份起始时间戳、value 为该年秒数 |
| `readLongest` | array | 阅读时长最长的书籍列表 `[{book, readTime, tags}]` |
| `readStat` | array | 统计摘要卡片：`[{stat: "读过", counts: "159本"}, {stat: "读完", counts: "6本"}, {stat: "阅读", counts: "762天"}, {stat: "笔记", counts: "1437条"}]` |
| `preferCategory` | array | 分类偏好 `[{categoryId, categoryTitle, parentCategoryTitle, readingCount, readingTime}]`，按阅读时长降序 |
| `preferCategoryWord` | string | 分类偏好文案 |
| `preferTime` | array | 24 小时阅读时长分布（数组下标 0-23 对应小时） |
| `preferTimeWord` | string | 时间偏好文案（如"偏好上午与夜晚阅读"） |
| `preferAuthor` | array | 偏好作者 `[{authorId, name, count, readTime}]`（readTime 已格式化为"X小时Y分钟"） |
| `authorCount` | int | 读过的作者数 |
| `preferPublisher` | array | 偏好出版社 |
| `preferCp` | array | 偏好内容方 |
| `preferBooks` | array | 偏好书籍分组（如 `{type: 13, title: "我的最爱"}`） |
| `readRate` / `rank` | null | 部分字段可能为 null |
| `registTime` | int | 微信读书注册时间戳 |
| `medals` | array | 徽章列表 |
| `readRecordsWord` / `readDistributionWord` | string | 卡片标题文案（"书籍分布"/"点评分布"） |
| `compare` / `baseTime` / `dayAverageReadTime` / `wrReadTime` / `wrListenTime` | - | 对比数据、日均时长、微信读书/听书时长（随 mode 变化） |

> **NINA 用途**：`preferCategory`、`preferAuthor`、`preferTime`、`readTimes` 直接支撑 PRD 的「知识结构 / 兴趣结构 / 阅读人格」六维分析。

---

### 3.15 `/book/recommend` — 个性化推荐

获取"为你推荐"的个性化书籍。

**入参：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `count` | int | ❌ | 12 | 每页数量 |
| `maxIdx` | int | ❌ | 0 | 翻页偏移 |

**返回字段：** `books[]`（结构同书籍信息）

---

### 3.16 `/book/similar` — 相似书籍

获取与某本书相似的推荐书籍。

**入参：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `bookId` | string | ✅ | - | 书籍 ID |
| `count` | int | ❌ | 12 | 每页数量 |
| `maxIdx` | int | ❌ | 0 | 翻页偏移 |
| `sessionId` | string | ❌ | - | 翻页会话 ID（首次不传，后续传回包中的值） |

**返回字段：** `booksimilar`

---

### 3.17 `/discover/interact/type3` — 朋友在读动态

获取发现页"朋友在读"动态（书籍卡片），按 `updateTime` 从新到旧排序。

**入参：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `count` | int | ❌ | 20 | 返回数量 |
| `maxIdx` | int | ❌ | - | 翻页游标，传上一页的 `nextMaxIdx` |
| `synckey` | int | ❌ | - | 同步游标，首次不传，后续传上一页回包中的值 |

**返回字段：** `synckey`、`count`、`hasMore`、`nextMaxIdx`、`items`

---

## 4. NINA 数据导入建议链路

基于以上接口，PRD 中「KEY 数据导入 → 阅读瞬间」的推荐调用顺序：

```
1. /shelf/sync                      → 书架全量书单（起点）
2. /user/notebooks (分页 lastSort)  → 有笔记的书单 + 每本 noteCount/reviewCount
3. 对每本书：
   a. /book/bookmarklist            → 全部划线（markText + createTime + chapterUid）
   b. /review/list/mine (分页)      → 全部想法（content + abstract + range）
   c. /book/getprogress             → 进度/累计时长/开始阅读时间
   d. /book/chapterinfo             → 章节目录（chapterUid → 章节标题映射）
4. /book/info                       → 补全书籍元数据（分类/出版社/评分）
5. /readdata/detail (4种 mode)      → 宏观阅读统计与偏好
```

**「阅读瞬间」合成方式**（对应 PRD 第 10 节）：

| 阅读瞬间要素 | 数据来源 |
|---|---|
| 划线原文 | `/book/bookmarklist` → `markText` |
| 评论内容 | `/review/list/mine` → `review.content` |
| 被评论的原文 | `/review/list/mine` → `review.abstract` |
| 关联（划线↔评论） | `bookId + chapterUid + range` 匹配 |
| 书籍信息 | `bookmarklist` 回包内 `book` 或 `/book/info` |
| 章节标题 | `/book/chapterinfo` |
| 发生时间 | `createTime` |

**工程注意事项：**

1. **增量同步**：`bookmarklist` 的 `removed` 数组和各接口的 `synckey` 可用于后续增量更新，避免每次全量拉取
2. **限频**：逐本书拉取时建议串行/小并发 + 重试，未实测官方限频阈值
3. **Key 保管**：`wrk-` Key 绑定用户身份，应只在 NINA 后端（云函数）中使用，小程序前端不应持有
4. **不可导出的数据**：书签内容、正文全文（仅有 `summary` 摘要片段）、公众号文章内容

---

## 5. 变更记录

| 日期 | 版本 | 说明 |
|---|---|---|
| 2026-09-20 | v1.0 | 基于 skill_version 1.0.4 实测整理，覆盖全部 17 个接口 |
