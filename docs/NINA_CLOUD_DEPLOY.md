# NINA 云函数部署与验证

> 后端：按业务域拆分的 6 个云函数（`_shared/` 为唯一代码源，部署前用 `tools/sync-shared.js` 分发）
> 云环境：`cloudbase-d7g7rfps86982b7da`（appid `wx5064e8ba87f8d90c`）
> 过渡期：单网关 `nina-api` 保留作金丝雀回退（前端 action 未命中映射时自动回退），e2e 通过后删除

## 0. 代码结构与同步

```
cloudfunctions/
  _shared/            # 唯一代码源（下划线前缀不会被当云函数上传）
    config.js         # 环境变量读取 + 错误码 + 常量
    lib/              # db/respond/http/llm/weread/matcher/importer/analyzer/search
                      # + user(用户域) + momentItem + exploreUtils + gateway(网关工厂)
  nina-auth/          # auth_login, user_profile
  nina-import/        # import_key/status/step/sync
  nina-content/       # moments_list/detail, categories, books_list, topics_list/detail, share_cards
  nina-analysis/      # analysis_run/status/step
  nina-insight/       # discover_summary, tags_*, explore_*（12 个）
  nina-search/        # search
  nina-api/           # 过渡期金丝雀（全部 29 action），收尾后 git rm
tools/
  sync-shared.js      # 部署前必跑：把 _shared/lib + config.js 同步到各函数目录
  smoke-cloud.js      # 本地冒烟：stub wx-server-sdk 逐函数逐 action 触发 + 隔离断言
```

**改任何共享代码后**：`node tools/sync-shared.js`（或只同步目标函数）→ `node tools/smoke-cloud.js` → 再部署。

## 1. 云数据库集合（10 个，控制台手动建）

`users`、`import_jobs`、`books`、`moments`、`tags`、`topics`、`analyses`、`categories`、`read_stats`、`share_cards`

- **权限一律选「所有用户不可读写」**：客户端只经云函数访问；云函数写入文档自带 userId 字段做隔离（不带 _openid）
- 关键复合索引：
  - `moments(userId + createdAt)`、`moments(userId + bookId + createdAt)`
  - `books(userId + lastReadAt)`、`books(userId + momentCount)`
  - `import_jobs(userId + createdAt)`
  - `topics(userId + momentCount)`、`tags(userId + updatedAt)`

## 2. 部署云函数

```bash
node tools/sync-shared.js   # 先同步共享代码

# 微信开发者工具 / wechatide CLI（目录名即函数名；新函数首次部署后
# 常报「函数处于 Creating 状态」，等创建完成重发一次即可）
wechatide -c ClaudeCode cloud_fn_deploy --appid wx5064e8ba87f8d90c \
  --env cloudbase-d7g7rfps86982b7da \
  --path /Users/yongxu/Desktop/nina/cloudfunctions/nina-auth --remote-npm-install --token zyxtest
```

## 3. 函数级配置（控制台手动，wechatide 无此工具）

| 函数 | 超时 | ARK_* env | 说明 |
|---|---|---|---|
| nina-auth | 10s | — | 含冷启动余量 |
| nina-insight | 20s | — | tags_detail 的 loadMoments 逐条 getDoc 无 cap（批量 `_.in` 列为技术债） |
| nina-content | 60s | 需要 | topics_detail 走 LLM 懒摘要 |
| nina-search | 60s | 需要 | search 走 LLM 降级链路 |
| nina-import | 60s | — | import_step 9s 软预算 + 上游串行 250ms |
| nina-analysis | 60s | 需要 | LLM 超时上限 45s |

内存统一 256MB。env 建议六个函数统一配全套（防漏配）。

## 4. 环境变量（控制台「云函数 → <函数名> → 配置」）

| 变量 | 说明 |
|---|---|
| `ARK_API_KEY` | 火山方舟 Key（**只配环境变量，不进代码仓库**） |
| `ARK_BASE_URL` | 默认 `https://ark.cn-beijing.volces.com/api/plan/v3` |
| `ARK_MODEL` | 默认 `deepseek-v4.1-flash` |
| `WEREAD_SKILL_VERSION` | 默认 `1.0.4` |

代码对缺失 `ARK_API_KEY` 显式报错：内容接口（导入/瞬间/搜索降级）不受影响，仅 AI 分析类 action 返回错误。

## 5. 验证

1. **本地冒烟**：`node tools/smoke-cloud.js`（7 个目录逐 action + 外来 action 40400 隔离断言）
2. **函数测试**：云开发控制台函数测试 `{"action":"user_profile"}` → 无登录态应返 `40100`；小程序内调用应返 code=0
3. **端到端**（主手段）：编译模式直达 `pages/dev/cloud/index`，按域逐个验证：
   - nina-auth：`user_profile` / `auth_login`
   - nina-import：`import_status`（现有 job 续跑）→「循环 import_step」
   - nina-content：`moments_list` / `books_list` / `categories` / `share_cards` / `topics_detail`（验 ARK env）
   - nina-analysis：`analysis_run` →「循环 analysis_step」→ `analysis_status` 阶段揭示
   - nina-insight：`discover_summary` / `tags_list` / `tags_detail`（观察大数据量延迟）/ `explore_overview` / `explore_map` / 未分析维度 50200
   - nina-search：`search` q=自由（降级链路）
4. **数据核对**：控制台或 `wechatide cloud_db_read_doc` 抽查 moments/books 落库是否与上游一致（书架 67 本、笔记 1437 条）
5. **mock 回归**：`config.js` 保持 `isMock: true` 重编译，现有首页/消息/我的不受影响（WxMock 只拦截 wx.request，调试页走 callFunction 不受 mock 影响）

## 6. 前端切换与回退

- `config.js` 的 `cloudFunctions` 映射（6 域）+ `api/request.js` 的 `ACTION_FUNCTION`（29 action 显式枚举）：callAction 按域选函数；未命中映射回退 `cloudFunctionName`（nina-api 金丝雀）并 console.warn
- **回退**：`config.js` 的 `cloudFunctions` 置空（或删掉该字段）即全部流量回到 nina-api，无需改其他代码
- nina-api 删除条件：e2e 全过 + 观察期结束 → `git rm cloudfunctions/nina-api`（sync-shared.js 的 FNS 移除该项）→ 控制台删函数 → 前端择期去掉回退别名

## 7. 安全要点

- `wrk-` Key 只存 `users.keyEnc`（base64），任何 action 不下发；日志不打印 Key
- `ARK_API_KEY` 只在云函数环境变量
- 所有列表接口强制分页（callFunction 回包 1MB 限制）
- 长任务断点：`import_jobs`（9s 软预算/次）与 `analyses.steps`（单 step 单独重跑）均由前端轮询驱动
