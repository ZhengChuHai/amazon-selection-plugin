#!/usr/bin/env node
/**
 * 亚马逊选品计算 MCP Server (stdio)
 * 提供五因子打分、2026 FBA 费率与毛利测算、12 项指标统计与短板诊断工具。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  calculateProfitAndFba,
  evaluate12Metrics,
  scoreFiveFactors,
} from "./calculator.js";
import { fetch1688Top3Price } from "./ego-1688.js";
import { generateSelectionReportHtml } from "./report-html.js";

const server = new McpServer({
  name: "amazon-selection-calc",
  version: "1.0.0",
});

server.tool(
  "score_five_factors",
  "按五因子公式（需求 × 竞争 × 利润 × 合规 × 可运营）对候选品类初筛打分，任意一项 ≤ 2 分建议淘汰，0 分一票否决。",
  {
    categoryName: z.string().describe("候选品类名称"),
    demand: z.number().min(0).max(5).describe("需求得分 (0-5)"),
    competition: z.number().min(0).max(5).describe("竞争得分 (0-5)"),
    profit: z.number().min(0).max(5).describe("利润得分 (0-5)"),
    compliance: z.number().min(0).max(5).describe("合规得分 (0-5)"),
    operability: z.number().min(0).max(5).describe("可运营得分 (0-5)"),
    inEnhancedSafetyCategory: z.boolean().optional().describe("是否属于 2026 增强安全类目"),
    inHaulPriceZone: z.boolean().optional().describe("是否处于 20 美元以下 Haul 竞争区间"),
    tariffChecked: z.boolean().optional().describe("是否已按 HS 编码核查 2026 关税"),
    notes: z.string().optional().describe("补充说明"),
  },
  async (args) => {
    const result = scoreFiveFactors(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "calculate_profit_and_fba",
  "测算 2026 年亚马逊费后毛利率、尺寸分级（小号/大号标准件）、采购占比、HS 关税及预留广告后的净利率。",
  {
    priceUsd: z.number().positive().describe("预期售价（美元）"),
    purchaseCostUsd: z.number().nonnegative().describe("采购成本（美元）"),
    shippingToFbaUsd: z.number().nonnegative().optional().describe("单件头程运费（美元）"),
    weightOz: z.number().positive().describe("包装后重量（盎司 oz，1 磅 = 16 盎司）"),
    dimensionsInch: z
      .tuple([z.number().positive(), z.number().positive(), z.number().positive()])
      .optional()
      .describe("包装后尺寸 [长, 宽, 高]（英寸）"),
    referralFeeRate: z.number().min(0).max(1).optional().describe("佣金率（默认 0.15）"),
    tariffRatePct: z.number().min(0).optional().describe("2026 关税税率百分比（如 25 表示 25%）"),
    complianceAndInsurancePerUnitUsd: z
      .number()
      .nonnegative()
      .optional()
      .describe("单件认证/检测/商业责任险摊销（美元）"),
    fbaFeeOverrideUsd: z
      .number()
      .nonnegative()
      .optional()
      .describe("从亚马逊后台 FBA 计算器查到的精确配送费（美元），不传则用 2026 参考费率估算"),
    isPeakSeason: z.boolean().optional().describe("是否按旺季配送费估算"),
    adReservePct: z.number().min(0).max(100).optional().describe("预留广告占比（默认 12.5%）"),
  },
  async (args) => {
    const result = calculateProfitAndFba(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "evaluate_12_metrics",
  "汇总 12 项选品指标原始数据，自动计算头部评论数中位数、平均月销、价格中位数及各维度达标情况，输出短板诊断。",
  {
    categoryName: z.string().describe("候选品类名称"),
    totalMonthlySearchVolume: z.number().nonnegative().describe("核心词 + 前10相关词合计月搜索量"),
    top10MonthlySales: z.array(z.number().nonnegative()).describe("首页前10商品月销量数组"),
    maxKeywordTrafficSharePct: z.number().min(0).max(100).describe("最大关键词流量占比（%）"),
    top10ReviewCounts: z.array(z.number().nonnegative()).describe("首页前10商品评论数数组"),
    top10Ratings: z.array(z.number().min(0).max(5)).describe("首页前10商品星级数组"),
    topBrandSharePct: z.number().min(0).max(100).describe("前10名中单一品牌最高占比（%）"),
    newEntrantsLast6Months: z.number().int().nonnegative().describe("近半年上架并挤进头部的新品数"),
    top10PricesUsd: z.array(z.number().positive()).describe("首页前10商品售价数组（美元）"),
    grossMarginPct: z
      .number()
      .optional()
      .describe("费后毛利率（%），来自 calculate_profit_and_fba；未测算时不传，该项标记为数据缺失"),
    sizeTier: z
      .enum(["small_standard", "large_standard", "oversize"])
      .optional()
      .describe("包装尺寸分级；未知时不传，该项标记为数据缺失"),
    hasComplianceBlocker: z.boolean().describe("是否存在无法解决的合规或侵权阻塞"),
    hasHighReturnRiskSignal: z.boolean().describe("是否存在经常退货标记或高退货预警"),
    topReturnReasons: z.array(z.string()).optional().describe("商机探测器高频退货原因列表"),
  },
  async (args) => {
    const result = evaluate12Metrics(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "export_html_report",
  "生成带 SVG 图标、五因子雷达图、2026 利润拆解和 12 项指标体检表的可视化 HTML 报告并保存到本地文件。",
  {
    categoryName: z.string().describe("候选品类名称"),
    outputPath: z.string().optional().describe("输出 HTML 文件路径（默认保存为当前目录下 selection-report-<品类>.html）"),
    fiveFactors: z
      .object({
        demand: z.number().min(0).max(5),
        competition: z.number().min(0).max(5),
        profit: z.number().min(0).max(5),
        compliance: z.number().min(0).max(5),
        operability: z.number().min(0).max(5),
        inEnhancedSafetyCategory: z.boolean().optional(),
        inHaulPriceZone: z.boolean().optional(),
        tariffChecked: z.boolean().optional(),
      })
      .optional()
      .describe("五因子打分输入"),
    profitInput: z
      .object({
        priceUsd: z.number().positive(),
        purchaseCostUsd: z.number().nonnegative(),
        shippingToFbaUsd: z.number().nonnegative().optional(),
        weightOz: z.number().positive(),
        dimensionsInch: z
          .tuple([z.number().positive(), z.number().positive(), z.number().positive()])
          .optional(),
        referralFeeRate: z.number().min(0).max(1).optional(),
        tariffRatePct: z.number().min(0).optional(),
        complianceAndInsurancePerUnitUsd: z.number().nonnegative().optional(),
        fbaFeeOverrideUsd: z.number().nonnegative().optional(),
        isPeakSeason: z.boolean().optional(),
        adReservePct: z.number().min(0).max(100).optional(),
      })
      .optional()
      .describe("利润测算输入"),
    metrics12Input: z
      .object({
        totalMonthlySearchVolume: z.number().nonnegative(),
        top10MonthlySales: z.array(z.number().nonnegative()),
        maxKeywordTrafficSharePct: z.number().min(0).max(100),
        top10ReviewCounts: z.array(z.number().nonnegative()),
        top10Ratings: z.array(z.number().min(0).max(5)),
        topBrandSharePct: z.number().min(0).max(100),
        newEntrantsLast6Months: z.number().int().nonnegative(),
        top10PricesUsd: z.array(z.number().positive()),
        grossMarginPct: z.number().optional(),
        sizeTier: z.enum(["small_standard", "large_standard", "oversize"]).optional(),
        hasComplianceBlocker: z.boolean(),
        hasHighReturnRiskSignal: z.boolean(),
        topReturnReasons: z.array(z.string()).optional(),
      })
      .optional()
      .describe("12 项指标原始输入"),
    breakthroughNotes: z.array(z.string()).optional().describe("短板破局或差异化建议列表"),
  },
  async (args) => {
    const ffResult = args.fiveFactors
      ? scoreFiveFactors({ categoryName: args.categoryName, ...args.fiveFactors })
      : undefined;
    const profitResult = args.profitInput
      ? calculateProfitAndFba(args.profitInput)
      : undefined;
    const metrics12Result = args.metrics12Input
      ? evaluate12Metrics({
          categoryName: args.categoryName,
          ...args.metrics12Input,
          grossMarginPct: args.metrics12Input.grossMarginPct ?? profitResult?.grossMarginPct ?? null,
          sizeTier: args.metrics12Input.sizeTier ?? profitResult?.sizeTier ?? null,
        })
      : undefined;

    const html = generateSelectionReportHtml({
      categoryName: args.categoryName,
      fiveFactors: args.fiveFactors && ffResult
        ? { ...args.fiveFactors, result: ffResult }
        : undefined,
      profit: profitResult,
      metrics12: metrics12Result,
      breakthroughNotes: args.breakthroughNotes,
    });

    const safeName = args.categoryName.replace(/[^\w\u4e00-\u9fa5-]+/g, "_");
    const targetPath = path.resolve(
      args.outputPath ?? `selection-report-${safeName}-${Date.now()}.html`,
    );
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, html, "utf8");

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ filePath: targetPath, bytes: Buffer.byteLength(html, "utf8") }, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "fetch_1688_top3_price",
  "通过本机 ego-browser 打开 1688 搜索页，按销量排序读取前 3 名商品价格，计算平均人民币采购价并换算为美元。",
  {
    keyword: z.string().describe("1688 搜索的中文产品关键词，例如：硅胶婴儿餐垫"),
    usdCnyRate: z.number().positive().optional().describe("美元兑人民币汇率（默认 7.2）"),
  },
  async (args) => {
    const result = await fetch1688Top3Price(args.keyword, args.usdCnyRate ?? 7.2);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("amazon-selection-calc MCP 启动失败:", err);
  process.exit(1);
});
