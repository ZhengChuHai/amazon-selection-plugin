import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateProfitAndFba,
  evaluate12Metrics,
  median,
  scoreFiveFactors,
} from "./calculator.js";
import { computeTop3Average, parse1688Price, parse1688Sales } from "./ego-1688.js";
import { generateSelectionReportHtml } from "./report-html.js";

describe("选品计算引擎验证", () => {
  it("五因子：硅胶刮刀（竞争2分、利润2分）应被淘汰", () => {
    const res = scoreFiveFactors({
      categoryName: "硅胶厨房刮刀套装",
      demand: 5,
      competition: 2,
      profit: 2,
      compliance: 4,
      operability: 5,
      inHaulPriceZone: true,
    });
    assert.equal(res.totalScore, 400);
    assert.equal(res.decision, "ELIMINATE");
    assert.equal(res.weakFactors.length, 2);
  });

  it("五因子：任意因子为 0 应一票否决", () => {
    const res = scoreFiveFactors({
      categoryName: "侵权热卖品",
      demand: 5,
      competition: 5,
      profit: 5,
      compliance: 0,
      operability: 5,
    });
    assert.equal(res.totalScore, 0);
    assert.equal(res.decision, "VETO_ZERO");
  });

  it("毛利测算：硅胶刮刀（$15，14oz，厚度>0.75，采购$3）毛利低于 35%", () => {
    const res = calculateProfitAndFba({
      priceUsd: 15,
      purchaseCostUsd: 3,
      weightOz: 14,
      dimensionsInch: [11, 4, 1.0], // 厚度 > 0.75 英寸 → 大号标准件
      fbaFeeOverrideUsd: 4.76,
    });
    assert.equal(res.sizeTier, "large_standard");
    assert.equal(res.referralFeeUsd, 2.25);
    assert.equal(res.grossMarginPct, 33.27);
    assert.equal(res.grossMarginPass, false);
    assert.equal(res.priceBandCheck, "TOO_LOW_HAUL_RISK");
  });

  it("毛利测算：硅胶婴儿餐垫带收纳盒套装（$25，1.25磅，采购$6.5）跨过 35% 合格线", () => {
    const res = calculateProfitAndFba({
      priceUsd: 25,
      purchaseCostUsd: 6.5,
      weightOz: 20, // 1.25 lb
      dimensionsInch: [12, 9, 1.2],
      fbaFeeOverrideUsd: 5.22,
    });
    assert.equal(res.sizeTier, "large_standard");
    assert.equal(res.referralFeeUsd, 3.75);
    assert.equal(res.grossMarginPct, 38.12);
    assert.equal(res.grossMarginPass, true);
    assert.equal(res.priceBandCheck, "PASS_20_TO_60");
  });

  it("12项指标：中位数计算不被超级头部拉高，正确诊断短板", () => {
    // 1 个 50000 评论的超级头部，其余都在 300-800 之间
    const reviews = [50000, 800, 650, 500, 480, 420, 350, 310, 290, 200];
    assert.equal(median(reviews), 450);

    const evalRes = evaluate12Metrics({
      categoryName: "硅胶婴儿餐垫套装",
      totalMonthlySearchVolume: 80000,
      top10MonthlySales: [1200, 900, 750, 600, 520, 480, 410, 380, 350, 310],
      maxKeywordTrafficSharePct: 35,
      top10ReviewCounts: [2100, 1800, 1200, 950, 800, 720, 640, 550, 410, 320],
      top10Ratings: [4.7, 4.6, 4.5, 4.1, 4.0, 4.4, 4.5, 4.3, 4.2, 3.9],
      topBrandSharePct: 22,
      newEntrantsLast6Months: 4,
      top10PricesUsd: [29.99, 27.99, 25.99, 25.0, 24.99, 23.99, 22.99, 21.99, 19.99, 18.99],
      grossMarginPct: 38.12,
      sizeTier: "large_standard",
      hasComplianceBlocker: false,
      hasHighReturnRiskSignal: false,
    });

    assert.equal(evalRes.computedStats.top10MedianReviews, 760);
    assert.equal(evalRes.overallStatus, "OPTIMIZE_SHORTBOARD");
    // 必须输出完整 12 项，且编号连续
    assert.equal(evalRes.checks.length, 12);
    assert.deepEqual(
      evalRes.checks.map((c) => c.id),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    );
  });

  it("12项指标：缺少毛利与尺寸数据时标记为数据缺失，而不是误判为不达标", () => {
    const evalRes = evaluate12Metrics({
      categoryName: "数据不全品类",
      totalMonthlySearchVolume: 80000,
      top10MonthlySales: [1200, 900, 750, 600, 520, 480, 410, 380, 350, 310],
      maxKeywordTrafficSharePct: 35,
      top10ReviewCounts: [450, 420, 400, 380, 360, 340, 320, 300, 280, 260],
      top10Ratings: [4.5, 4.4, 4.3, 4.1, 4.0, 4.4, 4.5, 4.3, 4.2, 3.9],
      topBrandSharePct: 22,
      newEntrantsLast6Months: 4,
      top10PricesUsd: [29.99, 27.99, 25.99, 25.0, 24.99, 23.99, 22.99, 21.99, 21.5, 20.99],
      hasComplianceBlocker: false,
      hasHighReturnRiskSignal: false,
    });

    const marginCheck = evalRes.checks.find((c) => c.id === 9)!;
    const sizeCheck = evalRes.checks.find((c) => c.id === 10)!;
    assert.equal(marginCheck.status, "UNKNOWN");
    assert.equal(sizeCheck.status, "UNKNOWN");
    assert.equal(evalRes.missingData.length, 2);
    assert.equal(evalRes.overallStatus, "INCOMPLETE_DATA");
  });

  it("HTML报告：生成带SVG雷达图、图标与12项指标的自包含网页", () => {
    const ff = { demand: 5, competition: 3, profit: 4, compliance: 3, operability: 4 };
    const ffResult = scoreFiveFactors({
      categoryName: "硅胶婴儿餐垫套装",
      ...ff,
      inEnhancedSafetyCategory: true,
    });
    const profitResult = calculateProfitAndFba({
      priceUsd: 25,
      purchaseCostUsd: 6.5,
      weightOz: 20,
      dimensionsInch: [12, 9, 1.2],
      fbaFeeOverrideUsd: 5.22,
    });
    const html = generateSelectionReportHtml({
      categoryName: "硅胶婴儿餐垫套装",
      fiveFactors: { ...ff, result: ffResult },
      profit: profitResult,
      breakthroughNotes: ["做成带收纳盒套装，售价拉升至 $25 以上"],
    });
    assert.ok(html.includes("<svg"));
    assert.ok(html.includes("五因子雷达图"));
    assert.ok(html.includes("38.12%"));
    assert.ok(html.includes("做成带收纳盒套装"));
  });

  it("1688采购价：正确解析销量与价格，按销量取前3平均价", () => {
    assert.equal(parse1688Sales("已售1.2万+件"), 12000);
    assert.equal(parse1688Sales("30天成交350+笔"), 350);
    assert.equal(parse1688Price("¥18.50 起"), 18.5);

    const { top3, avgPriceRmb, avgPriceUsd } = computeTop3Average(
      [
        { title: "A款", priceRmb: 12, salesCount: 300, salesText: "300", url: null },
        { title: "B款", priceRmb: 18, salesCount: 5000, salesText: "5000", url: null },
        { title: "C款", priceRmb: 24, salesCount: 1200, salesText: "1200", url: null },
        { title: "D款", priceRmb: 30, salesCount: 3000, salesText: "3000", url: null },
      ],
      7.2,
    );
    assert.deepEqual(
      top3.map((x) => x.title),
      ["B款", "D款", "C款"],
    );
    assert.equal(avgPriceRmb, 24);
    assert.equal(avgPriceUsd, 3.33);
  });
});
