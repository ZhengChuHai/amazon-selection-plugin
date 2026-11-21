# Amazon Product Selection Plugin（亚马逊选品 AI 插件）

一个开箱即用的亚马逊选品插件（Skill + MCP），把「五因子快速排除 + 12 项指标深度打表 + 2026 费率/关税/责任险测算 + 1688 拿货均价 + 可视化 HTML 报告」固化为标准化工作流。支持 Antigravity、Codex、Claude Code、Cursor。

> **免责声明**：插件内置的 FBA 配送费、佣金、关税、Amazon Haul 价格带、增强安全类目责任险、类目退货阈值等均为**经验参考值**，可能随政策调整而过时，**仅供选品初筛参考，以亚马逊及相关政府部门官方最新公布为准**。插件输出不构成法律、报关或投资建议。

> **安全边界**：计算 MCP、HTML 报告和 ego-browser 浏览器自动化都在本机运行，插件本身不收集、不上传数据。注意：**卖家精灵 MCP 是第三方远程服务**，密钥和查询关键词会发送到 `mcp.sellersprite.com`，请妥善保管密钥，不要提交到仓库。

---

## 核心能力

**1. 选品流程 Skill（`skills/amazon-product-selection/SKILL.md`）**

- **五因子初筛（相乘模型）**：需求 × 竞争 × 利润 × 合规 × 可运营，任一项 ≤ 2 分建议淘汰，0 分一票否决。
- **12 项指标打表**：头部评论数强制取中位数；覆盖搜索量、头部月销、搜索分散度、品牌集中度、新品存活数、星级痛点、价格带、毛利率、物流分级、合规、退货信号。
- **省额度**：初筛阶段不调用卖家精灵；进入精筛的品类合并为 2–3 次调用（`product_research` / `market_research` + 关键词挖掘），不逐个 ASIN 查询；默认不抓亚马逊前台页面。

**2. 计算与报告 MCP（`amazon-selection-calc`）**

| 工具 | 作用 |
| --- | --- |
| `score_five_factors` | 五因子相乘打分与红线检查 |
| `calculate_profit_and_fba` | 尺寸分级、估算 FBA 配送费、关税与费后毛利率 |
| `evaluate_12_metrics` | 12 项指标汇总与短板诊断；缺失数据标记为“数据缺失” |
| `fetch_1688_top3_price` | 通过本机 ego-browser 在 1688 搜索，按销量取前 3 名平均价并换算美元 |
| `export_html_report` | 生成自包含 HTML 报告（雷达图、利润拆解、12 项体检表），可直接打印为 PDF |

---

## 前置条件

| 依赖 | 是否必需 | 说明 |
| --- | --- | --- |
| Node.js ≥ 20 | 必需 | 运行计算 MCP |
| pnpm 或 npm | 必需 | 安装依赖与构建 |
| 卖家精灵 MCP 密钥 | 建议 | 在 [卖家精灵开放平台](https://open.sellersprite.com/) 获取，按其套餐计费；没有时需手动提供市场数据 |
| ego-browser | 可选 | 仅 `fetch_1688_top3_price` 需要；默认查找 `~/.local/bin/ego-browser` 或 PATH，也可用环境变量 `EGO_BROWSER_BIN` 指定；没有时手动提供采购价即可 |
| 亚马逊卖家后台 | 可选 | 查询商机探测器（POE）搜索量与退货原因 |

---

## 一、下载与构建

```bash
git clone https://github.com/ZhengChuHai/amazon-selection-plugin.git
cd amazon-selection-plugin
pnpm install
pnpm build   # 生成 dist/（dist 不在仓库里，必须执行）
pnpm test    # 可选：运行单元测试
pwd          # 记下绝对路径，后面配置 MCP 要用
```

使用 npm 时改为 `npm install`、`npm run build`、`npm test`。

---

## 二、安装到 AI 客户端

每个客户端都要完成两件事：**挂载 Skill**，**配置两个 MCP**（`amazon-selection-calc` 和 `sellersprite`）。下文 `/你的绝对路径/` 替换为上一步 `pwd` 的结果。

### Antigravity

1. 挂载插件（Skill 与计算 MCP 随插件加载）：
   ```bash
   mkdir -p ~/.gemini/config/plugins
   ln -s "$(pwd)" ~/.gemini/config/plugins/amazon-selection-plugin
   ```
2. 编辑仓库内 `mcp_config.json`，把 `"dist/index.js"` 改成 `"/你的绝对路径/dist/index.js"`（本地改动，不必提交）。
3. 在 `~/.gemini/config/mcp_config.json` 中加入卖家精灵：
   ```json
   {
     "mcpServers": {
       "sellersprite": {
         "url": "https://mcp.sellersprite.com/mcp",
         "headers": { "secret-key": "你的卖家精灵密钥" }
       }
     }
   }
   ```
4. 重启 Antigravity，确认插件已启用。

### Codex

1. 挂载 Skill：
   ```bash
   mkdir -p ~/.codex/skills
   ln -s "$(pwd)/skills/amazon-product-selection" ~/.codex/skills/amazon-product-selection
   ```
2. 编辑 `~/.codex/config.toml`：
   ```toml
   [mcp_servers.amazon-selection-calc]
   command = "node"
   args = ["/你的绝对路径/dist/index.js"]

   [mcp_servers.sellersprite]
   url = "https://mcp.sellersprite.com/mcp"

   [mcp_servers.sellersprite.http_headers]
   "secret-key" = "你的卖家精灵密钥"
   ```
3. 重启 Codex。

### Claude Code

1. 挂载 Skill：
   ```bash
   mkdir -p ~/.claude/skills
   ln -s "$(pwd)/skills/amazon-product-selection" ~/.claude/skills/amazon-product-selection
   ```
2. 添加 MCP：
   ```bash
   claude mcp add amazon-selection-calc -- node /你的绝对路径/dist/index.js
   claude mcp add --transport http sellersprite https://mcp.sellersprite.com/mcp --header "secret-key: 你的卖家精灵密钥"
   ```
3. 用 `claude mcp list` 确认连接正常。

### Cursor

1. 编辑 `~/.cursor/mcp.json`：
   ```json
   {
     "mcpServers": {
       "amazon-selection-calc": {
         "command": "node",
         "args": ["/你的绝对路径/dist/index.js"]
       },
       "sellersprite": {
         "url": "https://mcp.sellersprite.com/mcp",
         "headers": { "secret-key": "你的卖家精灵密钥" }
       }
     }
   }
   ```
2. 若你的 Cursor 版本不支持 Skills，把 `SKILL.md` 正文复制为项目规则 `.cursor/rules/amazon-product-selection.mdc`。

> 可选提速：ego-browser 冷启动较慢，需要频繁查 POE 或 1688 时，可额外配置常驻的 Playwright MCP 或 Chrome DevTools MCP。

---

## 三、验证安装

1. **本地自检**：`pnpm test` 全部通过即计算引擎正常。
2. **计算 MCP**：在客户端输入“算一下售价 25 美元、重 1.25 磅、尺寸 12×9×1.2 英寸、采购 6.5 美元的产品的费后毛利率”，返回费用拆解即连通。
3. **卖家精灵**：输入“用卖家精灵查一下 silicone spatula 的月搜索量”，返回数据即密钥有效。

---

## 四、使用方法

### 示例提示词

| 场景 | 示例 |
| --- | --- |
| 批量初筛 | 帮我用五因子公式初筛：硅胶厨房刮刀、蓝牙体重秤、宠物舔食垫 |
| 深度评估 | 对“硅胶婴儿餐垫”跑一遍 12 项指标打表和 2026 毛利测算，生成 HTML 报告 |
| 利润测算 | 售价 25 美元、重 1.25 磅、采购 6.5 美元、关税 25%，算费后毛利和净利 |
| 查采购价 | 用 1688 查“硅胶婴儿餐垫”销量前 3 的平均拿货价 |

### 工作流程

1. **候选池与采购价**：有采购价直接提供；没有则调用 `fetch_1688_top3_price`（需 ego-browser 且已登录 1688，遇到登录或验证会提示你手动处理）。
2. **五因子初筛**：先淘汰明显不合格的品类，不消耗卖家精灵次数。
3. **12 项指标精筛**：调用卖家精灵取数，联网查 HTS 关税、认证要求、商标与外观专利。
4. **短板诊断**：毛利不足时测算套装/差异化提价方案。
5. **输出报告**：生成 HTML 报告，并在对话中总结结论。

### 报告保存位置

`export_html_report` 默认保存在 MCP 进程的当前工作目录（各客户端不同）。建议在提示词中指定，例如“把报告保存到 ~/Desktop/选品报告/”，AI 会通过 `outputPath` 参数传入。

---

## 五、参考值说明（以官方为准）

| 数据 | 插件中的处理 | 核对渠道 |
| --- | --- | --- |
| FBA 配送费 | 内置简化费率表估算；可用 `fbaFeeOverrideUsd` 传入精确值 | 卖家后台 FBA 收入计算器、卖家中心费率公告 |
| 尺寸分级 | 按包装重量与三边判定，**未计算体积重**；不传尺寸时仅按重量粗判 | 卖家中心「商品尺寸分段」说明 |
| 佣金 | 默认 15%，可用 `referralFeeRate` 覆盖 | 卖家中心各类目销售佣金表 |
| 关税 | 需自行传入 `tariffRatePct`，按采购成本计算 | [USITC HTS](https://hts.usitc.gov/)，并请货代/报关行确认 |
| Haul 价格带 | 售价 < 20 美元提示低价区竞争 | 亚马逊官方 Haul 政策 |
| 增强安全类目责任险 | 仅作提示，摊销成本需自行传入 | 卖家中心商业保险要求公告 |
| 类目退货阈值 | SKILL 中给出的数值仅为经验参考 | 卖家后台「退货与回收分析」 |

**正式下单开模前**：请找货代确认最终 10 位 HTS 编码，并委托知识产权代理复核美国外观专利。

---

## 六、常见问题

- **MCP 启动失败 / 找不到 `dist/index.js`**：确认已执行 `pnpm build`，且配置里用的是绝对路径。
- **卖家精灵返回未授权或额度不足**：检查密钥是否正确、套餐是否到期或次数用尽。
- **1688 查价失败**：确认已安装 ego-browser，并在其中登录过 1688；遇到滑块验证请手动完成后重试。
- **报告找不到**：查看工具返回的 `filePath`，或在提示词里指定保存路径。

---

## 七、项目结构与开发

```text
amazon-selection-plugin/
├── skills/amazon-product-selection/SKILL.md  # 选品流程 Skill
├── src/
│   ├── index.ts            # MCP Server 入口（注册 5 个工具）
│   ├── calculator.ts       # 五因子 / 利润 / 12 项指标计算
│   ├── report-html.ts      # HTML 报告生成
│   ├── ego-1688.ts         # 1688 采购价抓取
│   └── calculator.test.ts  # 单元测试
├── plugin.json             # Antigravity 插件清单
├── mcp_config.json         # 插件 MCP 配置
└── package.json
```

```bash
pnpm dev     # 监听编译
pnpm build   # 编译
pnpm test    # 测试（需先 build）
```

更新插件：`git pull && pnpm install && pnpm build`，然后重启客户端。

---

## 许可证

[MIT](./LICENSE) © ZhengChuHai
