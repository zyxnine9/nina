# NINA UI 风格规范（Style Guide）

> 依据：`docs/prd.png` 设计稿（19 块界面）+ `NINA_PRD_v1.0.md` 第 25 节设计方向
> 配色数值来自对设计稿的实际像素采样，非主观指定。
> 配套演示页：[index.html](./index.html)

---

## 1. 风格一句话

> **像一个很懂你的现代工具，而不是一个复杂的数据分析后台。**

Apple / Google 式的极简排版风：黑白双主题、大量留白、层级靠字号与间距而非色彩、唯一的强调色是柔和的蓝紫渐变。内容（引文、洞察句）是主角，界面退到幕后。

---

## 2. 设计原则

| 原则 | 在设计稿中的体现 |
|---|---|
| **内容即界面** | 发现页第一屏只有一句话 + 三个标签胶囊（#7），没有任何导航控件争夺注意力 |
| **黑白灰为骨，蓝紫为魂** | 全局仅黑白灰 + 蓝紫强调色；暖橙等彩色只出现在环形图等数据可视化里（#10） |
| **深浅双主题对等** | 浅色主题与深色主题是两套完整配色而非简单反转（#6 分析中、#12 知识专题、#19 双主题对照） |
| **圆角胶囊语言** | 按钮全部是全圆角胶囊（按钮高度 ≈ 44px，圆角 = 高度一半），卡片圆角统一大圆角 |
| **人格化文案** | 「NINA 正在努力认识你」「你的下一次发现，或许就在不远处」（#5、#16）——文案是 UI 的一部分 |
| **数据克制展示** | 统计用「12 本 · 31 个瞬间 · 8 条评论」的点间隔短句，不做仪表盘 |

---

## 3. 色彩系统

### 3.1 浅色主题（默认）

| Token | 值 | 采样来源 |
|---|---|---|
| `--bg` | `#FCFCFC` | 页面底色（采样主色，n=52100） |
| `--bg-secondary` | `#F4F6F8` | 分组底、输入框底 |
| `--bg-card` | `#FFFFFF` | 卡片 |
| `--text-primary` | `#1A1D24` | 主文字（近黑，非纯黑） |
| `--text-secondary` | `#6B7280` | 次级文字、副标题 |
| `--text-tertiary` | `#9CA3AF` | 占位符、时间戳 |
| `--separator` | `#ECF0F4` | 分隔线、描边（冷灰，采样 n=9202） |
| `--accent` | `#4890F0` | 强调蓝（采样 #4890f0/#6090f0） |
| `--accent-soft` | `#A8C0F0` | 浅蓝辅助 |
| `--accent-gradient` | `linear-gradient(135deg, #A8C0F0, #4890F0)` | 品牌渐变（球体/拱门意象） |
| `--btn-primary-bg` | `#17181C` | 主按钮：**黑色胶囊**，不是蓝色（设计稿所有主按钮均为近黑） |

### 3.2 深色主题

| Token | 值 | 采样来源 |
|---|---|---|
| `--bg` | `#12181F` | 深色屏底（采样 #182430/#181824，蓝黑炭色而非纯黑） |
| `--bg-card` | `#1C232C` | 深色卡片 |
| `--text-primary` | `#F2F4F7` | |
| `--text-secondary` | `#8A94A3` | |
| `--separator` | `#2A3340` | |
| `--btn-primary-bg` | `#F2F4F7`（配黑字） | 深色主题下主按钮反白 |

### 3.3 数据可视化色板（环形图/折线，低饱和多色）

```
蓝 #6090F0 · 青 #4FA8A0 · 橙 #F0A878 · 金 #E8C478 · 紫 #9088D8 · 灰 #C8CEDA
```

> 规则：彩色只属于「数据」，不用于装饰按钮、标签等 UI 元素。

---

## 4. 字体与排版

| 层级 | 规格 | 用途 |
|---|---|---|
| 品牌字 | 34px / 300 / `letter-spacing: 0.35em` | 「NINA」logo 字（设计稿为细体大间距） |
| 大标题（洞察句） | 22-24px / 700 / `line-height: 1.5` | 发现页第一屏的一句话 |
| 页面标题 | 20px / 700 | 「探索」「痕迹」 |
| 副标题 | 13px / 400 / `--text-secondary` | 「这是一本关于我的书」 |
| 正文/引文 | 15px / 400 / `line-height: 1.7` | 阅读瞬间引文 |
| 标注 | 11-12px / 400 / `--text-tertiary` | 日期、来源、统计 |

- 字族：`-apple-system, "PingFang SC", "Helvetica Neue", sans-serif`
- 中文标题用**粗体 + 紧凑行高**制造排版感；引文用**宽松行高**制造呼吸感
- 数字不加粗、不用等宽，混排在「12 本 · 31 个瞬间」句式里

---

## 5. 几何与阴影

```css
--radius-card: 16px;     /* 卡片 */
--radius-chip: 999px;    /* 胶囊（按钮/标签） */
--radius-input: 12px;    /* 输入框 */
--shadow-card: 0 1px 3px rgba(23, 28, 38, .04), 0 8px 24px rgba(23, 28, 38, .06);
--space-unit: 4px;       /* 间距 4 的倍数：8/12/16/20/24/32 */
```

- 卡片**几乎无阴影**，靠 1px 极淡描边 + 底色差区分层级（Apple 风）
- 屏幕左右安全边距 20px
- 底部 TabBar：图标 + 10px 文字，选中态为实心圆点图标 + 加粗

---

## 6. 核心组件 CSS

### 6.1 主按钮（黑色胶囊）

```css
.btn-primary {
  height: 48px;
  padding: 0 24px;
  border-radius: 999px;
  background: var(--btn-primary-bg);
  color: var(--bg);              /* 浅色主题下黑底白字 */
  font-size: 16px;
  font-weight: 600;
  width: 100%;
}
```

### 6.2 标签胶囊（身份型标签）

```css
.chip {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--bg-secondary);
  border: 1px solid var(--separator);
  font-size: 13px;
  color: var(--text-primary);
}
```

### 6.3 阅读瞬间引文卡

```css
.moment-card {
  background: var(--bg-card);
  border: 1px solid var(--separator);
  border-radius: var(--radius-card);
  padding: 20px;
}
.moment-card .quote {
  font-size: 15px; line-height: 1.7;
}
.moment-card .meta {
  margin-top: 12px;
  font-size: 11px; color: var(--text-tertiary);
}
.moment-card .topic-tags { display: flex; gap: 8px; margin-top: 12px; }
.moment-card .topic-tags span {
  font-size: 11px; color: var(--accent);
  background: transparent; border: none;
}
```

### 6.4 洞察句（发现页第一屏）

```css
.headline {
  font-size: 23px;
  font-weight: 700;
  line-height: 1.55;
  letter-spacing: .01em;
}
```

### 6.5 环形图（纯 CSS conic-gradient 实现）

```css
.donut {
  width: 160px; aspect-ratio: 1; border-radius: 50%;
  background: conic-gradient(
    #6090F0 0 28%, #4FA8A0 28% 46%, #F0A878 46% 61%,
    #E8C478 61% 73%, #9088D8 73% 83%, #C8CEDA 83% 100%);
  -webkit-mask: radial-gradient(circle, transparent 58%, #000 59%);
          mask: radial-gradient(circle, transparent 58%, #000 59%);
}
```

### 6.6 进度时间线（导入/分析页）

```css
.timeline { display: grid; gap: 20px; position: relative; }
.timeline::before {
  content: ""; position: absolute; left: 9px; top: 8px; bottom: 8px;
  width: 2px; background: var(--separator);
}
.timeline .node {
  display: flex; gap: 14px; align-items: flex-start;
  font-size: 14px; color: var(--text-secondary);
}
.timeline .node .dot {
  width: 18px; height: 18px; border-radius: 50%; flex: none;
  background: var(--bg-card); border: 2px solid var(--separator);
  position: relative; z-index: 1;
}
.timeline .node.done  .dot { background: var(--accent); border-color: var(--accent); }
.timeline .node.done  { color: var(--text-primary); }
```

### 6.7 底部 TabBar

```css
.tabbar {
  display: flex; justify-content: space-around;
  padding: 8px 0 max(8px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--separator);
  background: var(--bg);
}
.tabbar .tab {
  font-size: 10px; color: var(--text-tertiary);
  display: grid; justify-items: center; gap: 2px;
}
.tabbar .tab.active { color: var(--text-primary); font-weight: 600; }
```

---

## 7. HTML 结构约定

```html
<!-- 页面骨架 -->
<body class="theme-light">        <!-- theme-light | theme-dark 切换 -->
  <main class="page">
    <header class="nav">…</header>
    <section class="headline">…</section>   <!-- 洞察句永远最靠前 -->
    <div class="chips">…</div>              <!-- 标签胶囊流 -->
    <section class="cards">…</section>      <!-- 卡片流 -->
  </main>
  <nav class="tabbar">…</nav>
</body>
```

- 主题切换只换 `<body>` 的 class，全部颜色走 CSS 变量
- 一屏一个主行动点（黑色胶囊按钮），次级动作一律用文字链
- 图片区（标签详情头图、专题头图）压暗叠字：`linear-gradient(180deg, rgba(0,0,0,.0), rgba(0,0,0,.55))` + 白字

---

## 8. 禁止清单

- ❌ 彩色按钮、彩色描边卡片（黑色胶囊是唯一主按钮）
- ❌ 大面积数据仪表盘、密集图表（统计一律用点间隔短句）
- ❌ 纯黑 `#000` / 纯白对比过强的分割线（用蓝灰炭色与冷灰）
- ❌ 阴影过重（iOS 老式 double-shadow），投影透明度 ≤ 6%
- ❌ emoji 作为界面图标（用细线图标；emoji 仅出现在运营文案里）
