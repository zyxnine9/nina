# NINA 后端 API 文档

> 适用项目：NINA 微信小程序（AI 驱动的个人阅读与自我探索工具）
> 文档版本：v0.3（2026-09-20，MVP 设计稿）
> 上游数据依赖：见 [WeRead_API.md](./WeRead_API.md)

---

## 1. 总体设计

### 1.1 设计原则（对应 PRD）

1. **AI 是基础设施**：所有 AI 能力（标签生成、语义搜索、自动分类、画像）都封装在接口背后，前端只消费结果
2. **结论有感觉，证据有重量**：所有"洞察类"接口（标签、主题、六维）必须同时返回 `summary`（结论）和 `evidence`（证据），前端点击结论可下钻到证据
3. **不替用户定义自己**：标签/画像类结论均携带推测语气字段，并支持用户反馈（像我/不像我）
4. **个性化内容 + 稳定页面结构**：接口路径稳定，返回内容因人而异

### 1.2 通用约定

- **Base URL**：`https://<api-host>/v1`（云函数场景下为 HTTP 触发器地址；本地开发走 mock）
- **传输**：HTTPS，`Content-Type: application/json`（除上传外均为 POST/GET + JSON）
- **鉴权**：`Authorization: Bearer <access_token>`（wx.login 换取，见 2.1）
- **时间戳**：一律 Unix 秒
- **分页**：游标式，统一入参 `cursor`（首页不传）/ `limit`（默认 20，最大 100），返回 `nextCursor`（null 表示没有更多）

### 1.3 统一回包结构

```json
{
  "code": 0,          // 0=成功；非 0 见错误码表
  "message": "ok",    // 错误时的中文提示（可直接 toast）
  "data": { }         // 业务数据
}
```

> 与现有 `api/request.js` + `mock/WxMock.js` 的 `{code, success, data}` 包裹对齐，`success` 字段兼容保留。

### 1.4 错误码

| code | 含义 | 前端处理 |
|---|---|---|
| 0 | 成功 | - |
| 40100 | 未登录 / access_token 失效 | 跳转登录 |
| 40300 | 无权限访问该资源 | toast |
| 40400 | 资源不存在 | toast / 返回列表页 |
| 42200 | 参数校验失败 | toast `message` |
| 42900 | 请求过于频繁（含上游微信读书限频） | toast 稍后重试 |
| 50000 | 服务内部错误 | toast |
| 50100 | 上游微信读书接口错误（KEY 失效等） | 引导重新填 KEY |
| 50200 | AI 分析未完成 / 进行中 | 引导查看分析进度 |

### 1.5 接口总览

| 模块 | 接口 | 说明 | PRD 对应 |
|---|---|---|---|
| 认证 | `POST /auth/login` | 微信登录 | - |
| 认证 | `GET /user/profile` | 用户信息 | - |
| 导入 | `POST /import/key` | 提交微信读书 KEY | P0-1 KEY 数据导入 |
| 导入 | `GET /import/status` | 导入进度 | P0-2/3 数据解析 |
| 导入 | `POST /import/sync` | 增量同步 | P0-2 数据解析 |
| 分析 | `POST /analysis/run` | 触发分析 | P0-12/13 六维/用户理解模型 |
| 分析 | `GET /analysis/status` | 分析进度（渐进式揭示） | PRD 15 Step5 |
| 发现 | `GET /discover/summary` | 发现页第一屏 | P0-7 发现页 |
| 发现 | `GET /tags` | 身份标签列表 | P0-5 AI 标签 |
| 发现 | `GET /tags/{tagId}` | 标签详情（证据） | P0-6 标签详情 |
| 发现 | `POST /tags/{tagId}/feedback` | 标签反馈 | PRD 5.3 |
| 探索 | `GET /explore/overview` | 六维概览 | P0-8 探索页 |
| 探索 | `GET /explore/knowledge` | 知识结构 | P0-12 六维分析 |
| 探索 | `GET /explore/interest` | 兴趣结构 | P0-12 六维分析 |
| 探索 | `GET /explore/thinking` | 思维方式 | P0-12 六维分析 |
| 探索 | `GET /explore/long_term` | 长期关注 | P0-12 六维分析 |
| 探索 | `GET /explore/persona` | 阅读人格 | P0-12 六维分析 |
| 探索 | `GET /explore/unknown` | 未知领域 | P0-12 六维分析 |
| 探索 | `GET /explore/map` | 知识地图 | PRD 8.3 |
| 主题 | `GET /topics` | 知识专题列表 | P0-11 知识专题 |
| 主题 | `GET /topics/{topicId}` | 主题详情 | PRD 17 |
| 痕迹 | `GET /moments` | 阅读瞬间列表 | P0-4 阅读瞬间 |
| 痕迹 | `GET /moments/{momentId}` | 瞬间详情 | P0-4 |
| 痕迹 | `GET /categories` | 自动整理分类树 | P0-10 自动整理 |
| 痕迹 | `GET /books` | 我的书单（含分析元数据） | P0-2 |
| 痕迹 | `GET /search` | 超级搜索（语义） | P0-9 超级搜索 |
| 分享 | `POST /share/cards` | 生成分享卡片 | P1 分享卡片 |

---

## 2. 认证与用户

### 2.1 `POST /auth/login` — 微信登录

**入参：**

```json
{ "code": "wx.login 的临时 code" }
```

**返回：**

```json
{
  "accessToken": "eyJhbGciOi...",
  "expiresIn": 7200,
  "isNewUser": true
}
```

> `isNewUser=true` 时前端进入 PRD 15 的首次使用流程（欢迎页 → 解释数据价值 → 输入 KEY）。

### 2.2 `GET /user/profile` — 用户信息

**返回：**

```json
{
  "userId": "u_9a8f",
  "nickname": "NINA 用户",
  "avatar": "",
  "hasKey": true,               // 是否已绑定微信读书 KEY
  "keyStatus": "valid",         // valid | expired | none
  "lastSyncAt": 1759000000,
  "stats": { "bookCount": 159, "momentCount": 1437, "analysisAt": 1759100000 }
}
```

---

## 3. 数据导入（KEY）

> 后端持有 `wrk-` Key，调用上游微信读书 Agent API（见 WeRead_API.md 第 4 节链路）完成数据抓取与解析。**Key 不下发到前端。**

### 3.1 `POST /import/key` — 提交 KEY

**入参：**

```json
{ "key": "wrk-xxxxxxxx" }
```

**返回：**

```json
{ "importId": "imp_001", "accepted": true }
```

- 服务端校验 KEY 有效性（试调 `/shelf/sync`）；无效返回 `50100`，`message: "KEY 无效或已过期"`
- 校验通过后异步执行首次全量导入，前端轮询 3.2

### 3.2 `GET /import/status` — 导入进度

**入参：** `importId`（query，可选；不传返回最近一次）

**返回：**

```json
{
  "importId": "imp_001",
  "stage": "parsing",            // validating | fetching | parsing | analyzing | done | failed
  "progress": 62,                // 0-100
  "stats": {
    "bookCount": 67,             // 已发现书籍（来自 /shelf/sync）
    "notebookCount": 76,         // 有笔记的书（/user/notebooks）
    "momentCount": 1437,         // 已解析出的阅读瞬间（划线+想法）
    "highlightCount": 1200,      // 划线数
    "reviewCount": 237           // 想法数
  },
  "currentTask": "正在读取《失明症漫记》的划线",
  "error": null
}
```

### 3.3 `POST /import/sync` — 增量同步

**入参：** 无（服务端用 synckey/removed 增量拉取）

**返回：**

```json
{ "syncId": "syn_001", "newMomentCount": 12, "changedBookCount": 3 }
```

**增量策略（按上游能力分别处理）：**

| 数据 | 上游增量能力 | 策略 |
|---|---|---|
| 划线 | `/book/bookmarklist` 返回 `synckey` + `removed` | 游标增量 |
| 想法 | `/review/list/mine` 返回 `synckey`，翻页游标 | 游标增量 |
| 书架 | **`/shelf/sync` 无增量参数**，每次全量 | 全量拉取（成本低，单请求）；`changedBookCount` 通过对比每本书的 `readUpdateTime` 检测 |
| 进度 | `/book/getprogress` 返回 `synckey` | 可增量，但按书逐本调用，建议只对 `changedBookCount` 检测出的书调用 |

---

## 4. AI 分析

### 4.1 `POST /analysis/run` — 触发分析

**入参：** 无（服务端根据数据量自动决定全量/增量重分析；对应 PRD 12 的数据积累后更新）

**返回：**

```json
{ "analysisId": "ana_001" }
```

### 4.2 `GET /analysis/status` — 分析进度（渐进式揭示）

对应 PRD 15 Step5 的分阶段揭示，前端按 `stages[].revealed` 依次解锁展示。

**返回：**

```json
{
  "analysisId": "ana_001",
  "status": "running",           // running | done | failed
  "progress": 45,
  "stages": [
    { "key": "reading_feature",  "title": "阅读特征",   "revealed": true },
    { "key": "identity_tags",    "title": "身份标签",   "revealed": true },
    { "key": "moments",          "title": "阅读瞬间",   "revealed": true },
    { "key": "interest",         "title": "兴趣结构",   "revealed": false },
    { "key": "knowledge",        "title": "知识结构",   "revealed": false },
    { "key": "thinking",         "title": "思维方式",   "revealed": false },
    { "key": "long_term",        "title": "长期关注",   "revealed": false },
    { "key": "persona",          "title": "阅读人格",   "revealed": false },
    { "key": "unknown",          "title": "未知领域",   "revealed": false }
  ]
}
```

---

## 5. 发现页

### 5.1 `GET /discover/summary` — 第一屏

**返回（对应 PRD 7.2：一句话 + 身份型标签）：**

```json
{
  "headline": {
    "text": "你读了很多不同的书，但你似乎一直在寻找同一个答案。",
    "generateAt": 1759100000
  },
  "primaryTag": {
    "tagId": "tag_01",
    "name": "温和的怀疑者",
    "reason": "为什么我是这个？",
    "evidenceCount": 37
  },
  "tags": [
    { "tagId": "tag_02", "name": "方法论收藏家" },
    { "tagId": "tag_03", "name": "浪漫现实主义者" }
  ],
  "newInsight": {                 // 可为 null；事件触发的新洞察（PRD 12-D）
    "id": "ins_09",
    "title": "你最近的三本书都在讨论'改变'这件事"
  }
}
```

### 5.2 `GET /tags` — 身份标签列表

**入参：** `cursor` / `limit`

**返回：**

```json
{
  "nextCursor": null,
  "items": [
    {
      "tagId": "tag_01",
      "name": "温和的怀疑者",
      "summary": "基于你的阅读痕迹，我们推测……",
      "evidenceCount": 37,
      "bookCount": 12,
      "momentCount": 23,
      "feedback": null,            // null | like | somewhat | dislike
      "speculative": true          // 恒为 true，体现"推测而非定义"
    }
  ]
}
```

### 5.3 `GET /tags/{tagId}` — 标签详情（标签 → 为什么是我 → AI 分析 → 阅读证据）

**返回：**

```json
{
  "tagId": "tag_01",
  "name": "温和的怀疑者",
  "summary": "标签解释",
  "reasoning": "AI 推理过程：你多次在不同领域的书中对'权威结论'划线并留下质疑性评论……",
  "stats": {
    "bookCount": 12,
    "momentCount": 23,
    "highlightCount": 18,
    "reviewCount": 5,
    "firstSeenAt": 1704038400,
    "longTerm": true               // 是否长期存在的主题（PRD 5.2）
  },
  "books": [
    { "bookId": "924389", "title": "失明症漫记", "author": "若泽·萨拉马戈", "cover": "https://...", "momentCount": 6 }
  ],
  "moments": [
    {
      "momentId": "m_001",
      "type": "highlight",          // highlight | review
      "text": "我想我们没有失明，我想我们本来是盲人……",
      "comment": null,
      "book": { "bookId": "924389", "title": "失明症漫记", "cover": "https://..." },
      "chapterTitle": "17",
      "createdAt": 1717480913,
      "relevance": 0.92             // 与该标签的相关度
    }
  ],
  "trend": {                        // 长期趋势（弱化展示，PRD 17）
    "byYear": [ { "year": 2023, "count": 8 }, { "year": 2024, "count": 11 } ]
  },
  "relatedTopics": [
    { "topicId": "t_free", "name": "自由" }
  ],
  "feedback": null
}
```

### 5.4 `POST /tags/{tagId}/feedback` — 标签反馈

**入参：**

```json
{ "type": "like" }   // like=像我 | somewhat=有点像 | dislike=不像我
```

**返回：** `{}`（code=0 即成功；反馈进入用户理解模型，PRD 11 第四层）

---

## 6. 探索页（六维）

### 6.1 `GET /explore/overview` — 六维概览

**返回：**

```json
{
  "dimensions": [
    { "key": "knowledge",  "title": "知识结构", "oneLine": "经济与文学构成你的两大支柱", "itemCount": 8 },
    { "key": "interest",   "title": "兴趣结构", "oneLine": "你真正反复回到的是'人的处境'", "itemCount": 6 },
    { "key": "thinking",   "title": "思维方式", "oneLine": "你习惯用例子反驳定义", "itemCount": 4 },
    { "key": "long_term",  "title": "长期关注", "oneLine": "自由与自我欺骗出现了 4 年", "itemCount": 5 },
    { "key": "persona",    "title": "阅读人格", "oneLine": "夜间的沉浸式读者", "itemCount": 3 },
    { "key": "unknown",    "title": "未知领域", "oneLine": "这些领域可能与你高度相关", "itemCount": 7 }
  ]
}
```

### 6.2 六维详情接口

每个维度一个独立接口（路径固定、结构各异），公共字段统一为 `dimension` / `title` / `summary`（AI 总结）/ `evidence`（证据瞬间，结构同 5.3 moments）。

#### 6.2.1 `GET /explore/knowledge` — 知识结构

数据来源：上游 `/readdata/detail` 的 `preferCategory`（分类阅读时长）+ `/book/info` 分类 + AI 细分归并。

```json
{
  "dimension": "knowledge",
  "title": "知识结构",
  "summary": "经济与文学构成你的两大支柱",
  "items": [
    {
      "id": "k_econ",
      "name": "经济理财",
      "level": "core",              // core=核心领域 | sub=子领域 | related=关联主题
      "readingTime": 315161,
      "bookCount": 42,
      "momentCount": 130,
      "children": [
        { "id": "k_econ_trade", "name": "交易与技术分析", "bookCount": 9 }
      ]
    }
  ],
  "evidence": [ ]
}
```

#### 6.2.2 `GET /explore/interest` — 兴趣结构

数据来源：moments 语义聚合（AI 对划线/评论做主题聚类，非书籍分类）。无直接上游接口。

```json
{
  "dimension": "interest",
  "title": "兴趣结构",
  "summary": "你真正反复回到的是'人的处境'",
  "items": [
    { "id": "i_condition", "name": "人的处境", "bookCount": 18, "momentCount": 63, "spreadBooks": 9 }
  ],
  "evidence": [ ]
}
```

| 字段 | 说明 |
|---|---|
| `spreadBooks` | 该主题跨越的书籍数——跨书反复出现是"兴趣"区别于"知识"的关键信号 |

#### 6.2.3 `GET /explore/thinking` — 思维方式

数据来源：AI 对评论（`review.content`）与划线模式的风格分析（质疑型/例证型/联系型等）。无直接上游接口。

```json
{
  "dimension": "thinking",
  "title": "思维方式",
  "summary": "你习惯用例子反驳定义",
  "items": [
    { "id": "th_example", "name": "例证式思维", "momentCount": 24, "description": "你常在抽象论断处划线并补充反例" }
  ],
  "evidence": [ ]
}
```

#### 6.2.4 `GET /explore/long_term` — 长期关注

数据来源：moments 的 `createdAt` 按年聚合（上游 `createTime`）+ `/readdata/detail` 的 `baseTime` 历史周期。

```json
{
  "dimension": "long_term",
  "title": "长期关注",
  "summary": "自由与自我欺骗出现了 4 年",
  "items": [
    {
      "id": "lt_free",
      "name": "自由",
      "spanYears": 4,
      "firstSeenAt": 1672531200,
      "trend": { "byYear": [ { "year": 2023, "count": 8 }, { "year": 2024, "count": 11 } ] }
    }
  ],
  "evidence": [ ]
}
```

#### 6.2.5 `GET /explore/persona` — 阅读人格

数据来源：上游 `/readdata/detail` 的 `preferTime`（24 小时分布）/`ttsTime`（听书）/`readDays` + 进度行为（弃书率、完读率）。

```json
{
  "dimension": "persona",
  "title": "阅读人格",
  "summary": "夜间的沉浸式读者",
  "items": [
    { "id": "p_time", "name": "夜间沉浸型", "description": "62% 的阅读发生在 22 点后", "stats": { "peakHour": 23, "avgSessionSeconds": 2400, "ttsRatio": 0.12 } }
  ],
  "evidence": [ ]
}
```

#### 6.2.6 `GET /explore/unknown` — 未知领域

数据来源：AI 基于知识结构推断的盲区/潜在兴趣 + 上游 `/book/recommend`、`/book/similar`、`/store/search` 提供入门书。

```json
{
  "dimension": "unknown",
  "title": "未知领域",
  "summary": "这些领域可能与你高度相关",
  "items": [
    {
      "id": "u_phil",
      "name": "分析哲学",
      "level": "potential",          // potential=潜在兴趣 | blind=知识盲区
      "reason": "你在多本书中划线讨论'语言与真实'，但从未系统读过哲学",
      "entryBooks": [
        { "bookId": "...", "title": "...", "author": "...", "cover": "..." }
      ]
    }
  ],
  "evidence": [ ]
}

### 6.3 `GET /explore/map` — 知识地图

MVP 默认展示聚合层（PRD 8.3），不暴露复杂知识网络。

**返回：**

```json
{
  "nodes": [
    { "id": "n1", "name": "经济理财", "type": "domain", "weight": 315161 },
    { "id": "n2", "name": "自由", "type": "theme", "weight": 37 }
  ],
  "edges": [
    { "source": "n1", "target": "n2", "strength": 0.4 }
  ]
}
```

---

## 7. 知识专题（主题）

### 7.1 `GET /topics` — 专题列表

**入参：** `cursor` / `limit`

**返回：**

```json
{
  "nextCursor": null,
  "items": [
    {
      "topicId": "t_free",
      "name": "关于自由",
      "cover": "https://...",
      "bookCount": 12,
      "momentCount": 37,
      "relatedTopicCount": 8,
      "summary": "自由在你的阅读里出现了三种面貌……"
    }
  ]
}
```

### 7.2 `GET /topics/{topicId}` — 主题详情（对应 PRD 17）

**返回：**

```json
{
  "topicId": "t_free",
  "name": "自由",
  "stats": { "bookCount": 23, "momentCount": 47 },
  "books": [ { "bookId": "...", "title": "...", "cover": "...", "momentCount": 5 } ],
  "moments": [ ],                    // 结构同 5.3 moments（原始划线+评论）
  "aiSummary": "你为什么反复关注这个问题？——因为你……",
  "evolution": [                     // 主题演化，弱化时间维度，仅在有价值时返回
    { "period": "2023", "focus": "外在的自由", "momentIds": ["m_001", "m_002"] }
  ],
  "exploreNext": [                   // 继续探索：新主题/新领域/新问题/推荐方向
    { "type": "topic", "id": "t_meaning", "name": "意义感" },
    { "type": "question", "text": "你读过的书中，'逃离'总是与'责任'成对出现，为什么？" }
  ]
}
```

---

## 8. 痕迹页（证据层 + 个人知识库）

### 8.1 `GET /moments` — 阅读瞬间列表

**入参：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `cursor` / `limit` | - | ❌ | 分页 |
| `type` | string | ❌ | `highlight`（划线）\| `review`（想法），不传=全部 |
| `categoryId` | string | ❌ | 按自动整理分类过滤（见 8.3） |
| `bookId` | string | ❌ | 按书籍过滤 |
| `topicId` | string | ❌ | 按专题过滤 |
| `sort` | string | ❌ | `time`（默认，按发生时间倒序）\| `book`（按书聚合） |

**返回：**

```json
{
  "nextCursor": "cur_xxx",
  "items": [
    {
      "momentId": "m_001",
      "type": "highlight",
      "text": "我想我们没有失明……",
      "comment": null,
      "book": { "bookId": "924389", "title": "失明症漫记", "author": "若泽·萨拉马戈", "cover": "https://..." },
      "chapterTitle": "17",
      "categoryId": "c_philosophy",
      "categoryName": "哲学",
      "createdAt": 1717480913
    }
  ]
}
```

### 8.2 `GET /moments/{momentId}` — 瞬间详情

**返回：** 8.1 的单项 + 扩展字段：

```json
{
  "range": "12705-12743",
  "source": { "upstream": "weread", "bookmarkId": "924389_42_12705-12743" },
  "relatedMoments": [ ],            // AI 判定的语义相似瞬间
  "inTopics": [ { "topicId": "t_free", "name": "关于自由" } ]
}
```

### 8.3 `GET /categories` — 自动整理分类树

固定大类 + AI 动态细分类（PRD 9.2-B）。

**返回：**

```json
{
  "items": [
    {
      "categoryId": "c_method",
      "name": "方法论",              // 固定大类
      "momentCount": 320,
      "children": [                  // AI 动态细分
        { "categoryId": "c_method_decision", "name": "决策", "momentCount": 87 }
      ]
    }
  ]
}
```

### 8.4 `GET /books` — 我的书单

**入参：** `cursor` / `limit` / `sort`（`recent` 默认 \| `notes` 按笔记数）\| `q`（书名/作者模糊搜索）

**返回：**

```json
{
  "nextCursor": null,
  "items": [
    {
      "bookId": "924389",
      "title": "失明症漫记",
      "author": "若泽·萨拉马戈",
      "cover": "https://...",
      "category": "精品小说-社会小说",
      "momentCount": 132,
      "highlightCount": 119,
      "reviewCount": 13,
      "progress": 96,
      "readingTime": 47553,
      "lastReadAt": 1725378959,
      "finished": false,
      "bookmarkCount": 0           // 书签数；书签内容上游不可导出，仅展示数量提示"还有 N 个书签无法导入"
    }
  ]
}
```

### 8.5 `GET /search` — 超级搜索（语义）⭐

支持自然语言模糊查询（PRD 9.2-A：「我记得有句话，大概意思是……」）。

**入参：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `q` | string | ✅ | 查询文本（自然语言） |
| `scope` | string | ❌ | `moment`（默认，搜阅读瞬间）\| `book`（搜书单） |
| `categoryId` | string | ❌ | 限定分类 |
| `cursor` / `limit` | - | ❌ | 分页 |

**返回：**

```json
{
  "nextCursor": null,
  "queryUnderstanding": { "rewrittenQuery": "不要把人生交给别人定义", "topics": ["自我", "他人期待"] },
  "items": [
    {
      "momentId": "m_042",
      "type": "highlight",
      "text": "除非你把人生的选择权从别人手里拿回来……",
      "comment": "这句我读了三遍",
      "book": { "bookId": "...", "title": "...", "cover": "..." },
      "chapterTitle": "3",
      "createdAt": 1706889128,
      "score": 0.87                  // 语义相关度
    }
  ]
}
```

---

## 9. 分享

### 9.1 `POST /share/cards` — 生成分享卡片

**入参：**

```json
{ "type": "persona", "refId": "tag_01" }
// type: persona=阅读人格 | tag=身份标签 | topic=知识专题 | moment=阅读瞬间 | universe=我的阅读宇宙
```

**返回：**

```json
{
  "cardId": "sc_001",
  "imageUrl": "https://...",
  "title": "NINA 发现了我身上的一个标签：温和的怀疑者",
  "sharePath": "/pages/home/index?fromShare=sc_001"
}
```

> 分享数据层级遵循 PRD 18：默认私密（L0/L1），仅用户主动生成的卡片（L2）和专题（L3）可通过 `sharePath` 被他人查看，被分享者只读、不落库。

---

## 10. 核心数据模型

### Moment（阅读瞬间）— NINA 最小数据单位

| 字段 | 类型 | 说明 | 上游来源（WeRead API） |
|---|---|---|---|
| `momentId` | string | NINA 内部 ID | 生成 |
| `userId` | string | 所属用户 | KEY 绑定 |
| `bookId` | string | 书籍 ID | 上游一致 |
| `type` | enum | `highlight` \| `review` | bookmarklist / review-list-mine |
| `text` | string | 划线原文或想法正文 | `markText` / `review.content` |
| `comment` | string\|null | 划线附带的评论 | `review.content`（经 range 关联） |
| `abstract` | string\|null | 被评论的原文 | `review.abstract` |
| `chapterUid` / `chapterTitle` | int/string | 章节 | `/book/chapterinfo` |
| `range` | string | 字符偏移 `start-end`，用于划线↔评论关联 | `range` |
| `createdAt` | int | 发生时间 | `createTime` |
| `categoryId` | string | 自动整理分类 | AI 生成 |
| `embedding` | float[] | 语义向量（服务端内部） | AI 生成 |

> **⚠️ 划线↔评论关联（range 匹配）**：评论的 `range` 是用户**发评论时选中的文字**，与划线范围经常**不完全相等**（可能只选中划线的一部分，或偏移几个字符）。精确等值匹配会漏掉大量关联。实现时必须用**区间重叠匹配**：同书同章节下，`overlap / reviewRangeLength ≥ 0.8` 视为同一条；重叠度存入 `comment` 关联的可信度字段，低于阈值的评论作为独立瞬间（type=review）保留，不强行挂载。

### Tag（身份标签）

| 字段 | 类型 | 说明 |
|---|---|---|
| `tagId` | string | 内部 ID |
| `name` | string | 身份型标签名（如"温和的怀疑者"） |
| `summary` / `reasoning` | string | 解释 / AI 推理 |
| `speculative` | bool | 恒 true（"基于你的阅读痕迹，我们推测"） |
| `feedback` | enum\|null | like / somewhat / dislike |
| `momentIds` | string[] | 证据瞬间（可证据化） |

### Topic（知识专题）

| 字段 | 类型 | 说明 |
|---|---|---|
| `topicId` | string | 内部 ID |
| `name` | string | 主题名（如"自由"） |
| `momentIds` / `bookIds` | string[] | 聚合的瞬间与书籍（跨书聚合） |
| `aiSummary` | string | "你为什么反复关注这个问题" |
| `exploreNext` | array | 继续探索方向 |

---

## 11. 页面 ↔ 接口映射

| 页面 | 调用 |
|---|---|
| 登录 | `POST /auth/login` |
| 首次使用（KEY 导入） | `POST /import/key` → 轮询 `GET /import/status` |
| 首次分析（渐进揭示） | `POST /analysis/run` → 轮询 `GET /analysis/status` |
| 发现 Tab | `GET /discover/summary` → `GET /tags` → `GET /tags/{id}` + `POST /tags/{id}/feedback` |
| 探索 Tab | `GET /explore/overview` → `GET /explore/{knowledge|interest|thinking|long_term|persona|unknown}`、`GET /explore/map` |
| 痕迹 Tab | `GET /moments` / `GET /categories` / `GET /books` / `GET /topics` |
| 搜索页 | `GET /search` → `GET /moments/{id}` |
| 主题详情页 | `GET /topics/{id}` |
| 分享 | `POST /share/cards` |

---

## 12. 上游 WeRead 接口使用规划

### 12.1 已使用接口（P0 链路）

| 接口 | 用途 | 备注 |
|---|---|---|
| `/shelf/sync` | 书架全量 | 无增量参数，每次全量 |
| `/user/notebooks` | 有笔记书单 | 分页 `lastSort` |
| `/book/bookmarklist` | 划线全文 | 回包自带 `chapters[]` 章节映射，**通常无需再调 chapterinfo** |
| `/review/list/mine` | 个人想法 | 参数名是小写 `bookid` |
| `/book/getprogress` | 进度/时长 | 仅对有变化的书调用 |
| `/book/chapterinfo` | 章节目录 | 仅进度定位等 bookmarklist 未覆盖章节时才需要 |
| `/book/info` | 书籍元数据补全 | 免登录 |
| `/readdata/detail` | 宏观统计 | `preferCategory` 直接给分类阅读时长；支持 `baseTime` 查历史周期 |
| `/book/recommend` / `/book/similar` / `/store/search` | unknown 维度入门书 | |

### 12.2 预留接口

| 接口 | 用途 | 阶段 |
|---|---|---|
| `/book/bestbookmarks` | 热门划线对比："我的划线 vs 大众热门划线"，用户划了哪些**非热门句子**是强的个性化信号，可作为 persona/标签的证据增强 | P1 |
| `/review/single` / `/book/readreviews` | 想法详情/社交视角补充 | P2 |
| `/discover/interact/type3` | 朋友在读动态 | 暂无场景 |

### 12.3 工程注意事项

1. 所有上游请求必须带 `skill_version`（当前 1.0.4），业务参数平铺 body 顶层
2. 上游限频阈值未实测：逐本书拉取建议串行/小并发 + 指数退避重试；`/import/status` 的进度估算需考虑重试耗时
3. `wrk-` Key 绑定用户身份，仅存云函数环境变量，任何接口不得将其下发到前端
4. 不可导出的数据：书签内容、正文全文（仅 `summary` 片段）、公众号文章内容——相关统计只展示数量

---

## 13. 变更记录

| 日期 | 版本 | 说明 |
|---|---|---|
| 2026-09-20 | v0.3 | 六维分析拆分为六个独立接口：`/explore/knowledge`、`/explore/interest`、`/explore/thinking`、`/explore/long_term`、`/explore/persona`、`/explore/unknown`，各自定义结构并标注数据来源 |
| 2026-09-20 | v0.2 | 对照 WeRead_API 依赖审查：补充增量同步策略（书架无游标）、划线↔评论 range 重叠匹配规则、上游接口使用规划（bestbookmarks 预留 P1）、`/books` 增加 bookmarkCount |
| 2026-09-20 | v0.1 | MVP 设计稿：覆盖 PRD P0 全部 13 项能力，P1（反馈校准/分享）预留接口 |
