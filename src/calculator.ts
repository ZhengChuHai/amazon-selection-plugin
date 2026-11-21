/**
 * 亚马逊选品核心计算引擎：
 * 1. 五因子快速初筛（相乘模型 + ≤2分淘汰线）
 * 2. 2026 尺寸分级与费后毛利率测算（含 HS 关税、Haul 价格带、商业责任险摊销）
 * 3. 12 项选品指标统计计算（中位数、集中度、短板诊断）
 */

export interface FiveFactorInput {
  categoryName: string;
  /** 需求够大（1-5分，0表示无需求） */
  demand: number;
  /** 竞争可进（1-5分，0表示完全垄断无法切入） */
  competition: number;
  /** 利润够厚（1-5分，0表示亏本） */
  profit: number;
  /** 合规可做（1-5分，0表示侵权/无认证无法销售） */
  compliance: number;
  /** 自己能运营（1-5分，0表示发不了货/完全做不动） */
  operability: number;
  /** 是否命中 2026 增强安全类目（儿童/膳食补充剂/锂电池/小厨电/床垫等） */
  inEnhancedSafetyCategory?: boolean;
  /** 售价是否落在 20 美元以下（撞车 Amazon Haul 低价区） */
  inHaulPriceZone?: boolean;
  /** 是否已按 HS 编码核查 2026 关税 */
  tariffChecked?: boolean;
  notes?: string;
}

export interface FiveFactorResult {
  categoryName: string;
  totalScore: number;
  maxScore: number;
  decision: "VETO_ZERO" | "ELIMINATE" | "PASS";
  decisionLabel: string;
  weakFactors: string[];
  warnings2026: string[];
}

/** 计算数组的中位数 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[mid - 1]! + sorted[mid]!) / 2).toFixed(2));
  }
  return Number(sorted[mid]!.toFixed(2));
}

/** 计算数组的平均值 */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Number((sum / values.length).toFixed(2));
}

/** 1. 五因子快速初筛打分（相乘关系，任何一项为 0 则总分为 0，任意一项 <= 2 分淘汰） */
export function scoreFiveFactors(input: FiveFactorInput): FiveFactorResult {
  const factors: Array<[string, number]> = [
    ["需求", input.demand],
    ["竞争", input.competition],
    ["利润", input.profit],
    ["合规", input.compliance],
    ["可运营", input.operability],
  ];

  const totalScore =
    input.demand * input.competition * input.profit * input.compliance * input.operability;
  const zeroFactors = factors.filter(([, score]) => score === 0).map(([name]) => name);
  const weakFactors = factors.filter(([, score]) => score <= 2).map(([name, score]) => `${name}(${score}分)`);

  const warnings2026: string[] = [];
  if (input.inHaulPriceZone) {
    warnings2026.push("售价处于 20 美元以下区间，需直接对比 Amazon Haul 低价区竞争压力");
  }
  if (input.inEnhancedSafetyCategory) {
    warnings2026.push("属于增强安全类目：2026年11月2日起无论销量多少均需投保100万美元商业责任险");
  }
  if (input.tariffChecked === false) {
    warnings2026.push("尚未按材质和 HS 编码核查 2026 实际关税税率");
  }

  let decision: FiveFactorResult["decision"] = "PASS";
  let decisionLabel = "通过初筛，进入 12 项指标深度打表";

  if (zeroFactors.length > 0) {
    decision = "VETO_ZERO";
    decisionLabel = `一票否决（总分 0）：${zeroFactors.join("、")} 为 0 分`;
  } else if (weakFactors.length > 0) {
    decision = "ELIMINATE";
    decisionLabel = `建议淘汰（存在 ≤2 分短板）：${weakFactors.join("、")}`;
  }

  return {
    categoryName: input.categoryName,
    totalScore,
    maxScore: 3125,
    decision,
    decisionLabel,
    weakFactors,
    warnings2026,
  };
}

export interface ProfitInput {
  /** 预期售价（美元） */
  priceUsd: number;
  /** 采购成本（美元） */
  purchaseCostUsd: number;
  /** 头程运费单件成本（美元） */
  shippingToFbaUsd?: number;
  /** 包装后重量（盎司 oz，1 lb = 16 oz） */
  weightOz: number;
  /** 包装尺寸：长、宽、高（英寸 inch），用于判断小号/大号标准件 */
  dimensionsInch?: [number, number, number];
  /** 佣金率（小数，默认 0.15 即 15%） */
  referralFeeRate?: number;
  /** 2026 关税税率（百分比，例如 25 表示 25%） */
  tariffRatePct?: number;
  /** 单件合规/检测/商业责任险摊销成本（美元） */
  complianceAndInsurancePerUnitUsd?: number;
  /** 从亚马逊后台 FBA 收入计算器查到的精确配送费（美元）；不传则按 2026 参考费率估算 */
  fbaFeeOverrideUsd?: number;
  /** 是否按旺季费率估算（默认 false 平时费率） */
  isPeakSeason?: boolean;
  /** 预估广告占比（百分比，默认 12.5%，对应 10%-15% 经验区间） */
  adReservePct?: number;
}

export type SizeTier = "small_standard" | "large_standard" | "oversize";

/** 尺寸分级中文标签 */
export const SIZE_TIER_LABELS: Record<SizeTier, string> = {
  small_standard: "小号标准件 (新手优先)",
  large_standard: "大号标准件",
  oversize: "大件/超大件 (建议新手避开)",
};

/** 根据包装尺寸和重量判断亚马逊尺寸分段（2026 美国站参考线） */
export function classifySizeTier(
  weightOz: number,
  dimensionsInch?: [number, number, number],
): SizeTier {
  if (!dimensionsInch) {
    return weightOz <= 16 ? "small_standard" : weightOz <= 320 ? "large_standard" : "oversize";
  }
  const [longest, medianSide, shortest] = [...dimensionsInch].sort((a, b) => b - a) as [
    number,
    number,
    number,
  ];
  if (weightOz <= 16 && longest <= 15 && medianSide <= 12 && shortest <= 0.75) {
    return "small_standard";
  }
  if (weightOz <= 320 && longest <= 18 && medianSide <= 14 && shortest <= 8) {
    return "large_standard";
  }
  return "oversize";
}

/** 估算 2026 年平时/旺季 FBA 配送费（美元参考值，最终以卖家后台 FBA 收入计算器为准） */
export function estimate2026FbaFee(sizeTier: SizeTier, weightOz: number, isPeakSeason = false): number {
  const peakSurcharge = isPeakSeason ? 0.35 : 0;
  if (sizeTier === "small_standard") {
    if (weightOz <= 4) return Number((3.06 + peakSurcharge).toFixed(2));
    if (weightOz <= 8) return Number((3.31 + peakSurcharge).toFixed(2));
    if (weightOz <= 12) return Number((3.52 + peakSurcharge).toFixed(2));
    return Number((3.69 + peakSurcharge).toFixed(2));
  }
  if (sizeTier === "large_standard") {
    if (weightOz <= 8) return Number((3.92 + peakSurcharge).toFixed(2));
    if (weightOz <= 16) return Number((4.76 + peakSurcharge).toFixed(2));
    if (weightOz <= 24) return Number((5.22 + peakSurcharge).toFixed(2));
    if (weightOz <= 32) return Number((5.68 + peakSurcharge).toFixed(2));
    if (weightOz <= 48) return Number((6.45 + peakSurcharge).toFixed(2));
    // 超过 3 lb（48 oz）按每半磅递增参考估算
    const extraHalfLbs = Math.ceil((weightOz - 48) / 8);
    return Number((6.45 + extraHalfLbs * 0.45 + peakSurcharge).toFixed(2));
  }
  // 大件起步参考
  const weightLb = Math.max(1, Math.ceil(weightOz / 16));
  return Number((9.73 + Math.max(0, weightLb - 1) * 0.42 + peakSurcharge).toFixed(2));
}

export interface ProfitResult {
  sizeTier: SizeTier;
  sizeTierLabel: string;
  priceUsd: number;
  purchaseCostUsd: number;
  purchaseRatioPct: number;
  purchaseRatioPass: boolean;
  shippingToFbaUsd: number;
  tariffUsd: number;
  referralFeeUsd: number;
  fbaFeeUsd: number;
  fbaFeeSource: "override" | "estimated_2026_reference";
  complianceAndInsurancePerUnitUsd: number;
  grossProfitUsd: number;
  grossMarginPct: number;
  grossMarginPass: boolean;
  estimatedAdCostUsd: number;
  netProfitUsd: number;
  netMarginPct: number;
  priceBandCheck: "PASS_20_TO_60" | "TOO_LOW_HAUL_RISK" | "TOO_HIGH_DECISION_HEAVY";
  warnings: string[];
}

/** 2. 2026 费后毛利率与利润测算 */
export function calculateProfitAndFba(input: ProfitInput): ProfitResult {
  const referralRate = input.referralFeeRate ?? 0.15;
  const shippingToFbaUsd = input.shippingToFbaUsd ?? 0;
  const tariffRatePct = input.tariffRatePct ?? 0;
  const compliancePerUnit = input.complianceAndInsurancePerUnitUsd ?? 0;
  const adReservePct = input.adReservePct ?? 12.5;

  const sizeTier = classifySizeTier(input.weightOz, input.dimensionsInch);
  const sizeTierLabelMap = SIZE_TIER_LABELS;

  const fbaFeeUsd =
    input.fbaFeeOverrideUsd !== undefined
      ? Number(input.fbaFeeOverrideUsd.toFixed(2))
      : estimate2026FbaFee(sizeTier, input.weightOz, input.isPeakSeason ?? false);

  const referralFeeUsd = Number((input.priceUsd * referralRate).toFixed(2));
  const tariffUsd = Number((input.purchaseCostUsd * (tariffRatePct / 100)).toFixed(2));

  const totalCostBeforeAds =
    input.purchaseCostUsd +
    shippingToFbaUsd +
    tariffUsd +
    referralFeeUsd +
    fbaFeeUsd +
    compliancePerUnit;

  const grossProfitUsd = Number((input.priceUsd - totalCostBeforeAds).toFixed(2));
  const grossMarginPct = Number(((grossProfitUsd / input.priceUsd) * 100).toFixed(2));
  const purchaseRatioPct = Number(((input.purchaseCostUsd / input.priceUsd) * 100).toFixed(2));

  const estimatedAdCostUsd = Number((input.priceUsd * (adReservePct / 100)).toFixed(2));
  const netProfitUsd = Number((grossProfitUsd - estimatedAdCostUsd).toFixed(2));
  const netMarginPct = Number(((netProfitUsd / input.priceUsd) * 100).toFixed(2));

  const warnings: string[] = [];
  let priceBandCheck: ProfitResult["priceBandCheck"] = "PASS_20_TO_60";
  if (input.priceUsd < 20) {
    priceBandCheck = "TOO_LOW_HAUL_RISK";
    warnings.push("售价低于 $20：亚马逊费用占比过高，且直接撞入 Amazon Haul 低价区竞争");
  } else if (input.priceUsd > 60) {
    priceBandCheck = "TOO_HIGH_DECISION_HEAVY";
    warnings.push("售价高于 $60：买家决策周期长、评论门槛高，不建议新手作为首款产品");
  }

  if (sizeTier === "oversize") {
    warnings.push("产品属于大件/超大件，物流与仓储成本不可控，建议新手避开");
  }
  if (purchaseRatioPct > 25) {
    warnings.push(`采购成本占比 ${purchaseRatioPct}% 高于 25% 经验红线`);
  }
  if (grossMarginPct < 35) {
    warnings.push(`费后毛利率 ${grossMarginPct}% 低于 35% 合格线，建议评估是否可通过套装/差异化拉升客单价`);
  }

  return {
    sizeTier,
    sizeTierLabel: sizeTierLabelMap[sizeTier],
    priceUsd: input.priceUsd,
    purchaseCostUsd: input.purchaseCostUsd,
    purchaseRatioPct,
    purchaseRatioPass: purchaseRatioPct <= 25,
    shippingToFbaUsd,
    tariffUsd,
    referralFeeUsd,
    fbaFeeUsd,
    fbaFeeSource: input.fbaFeeOverrideUsd !== undefined ? "override" : "estimated_2026_reference",
    complianceAndInsurancePerUnitUsd: compliancePerUnit,
    grossProfitUsd,
    grossMarginPct,
    grossMarginPass: grossMarginPct >= 35,
    estimatedAdCostUsd,
    netProfitUsd,
    netMarginPct,
    priceBandCheck,
    warnings,
  };
}

export interface TwelveMetricsInput {
  categoryName: string;
  /** 1. 核心词 + 前10相关词合计月搜索量 */
  totalMonthlySearchVolume: number;
  /** 2. 首页前10商品估算月销量列表 */
  top10MonthlySales: number[];
  /** 3. 最大关键词流量占比（百分比，如 35 表示 35%） */
  maxKeywordTrafficSharePct: number;
  /** 4. 首页前10商品评论数列表（程序强制取中位数） */
  top10ReviewCounts: number[];
  /** 5. 首页前10商品星级评分列表 */
  top10Ratings: number[];
  /** 6. 前10名中单一品牌最高点击/销量占比（百分比） */
  topBrandSharePct: number;
  /** 7. 过去半年上架且进入头部的新品数量 */
  newEntrantsLast6Months: number;
  /** 8. 首页前10商品售价列表（美元） */
  top10PricesUsd: number[];
  /** 9. 利润测算结果（费后毛利率 %）；未测算时不传，状态标记为 UNKNOWN */
  grossMarginPct?: number | null;
  /** 10. 尺寸分级；未知时不传，状态标记为 UNKNOWN */
  sizeTier?: SizeTier | null;
  /** 11. 是否存在未解决的合规/侵权硬伤 */
  hasComplianceBlocker: boolean;
  /** 12. 竞品是否出现「经常退货」标记或高退货率信号 */
  hasHighReturnRiskSignal: boolean;
  /** 12. 商机探测器提取的高频退货原因 */
  topReturnReasons?: string[];
}

export interface MetricCheckItem {
  id: number;
  name: string;
  value: string;
  benchmark: string;
  /** UNKNOWN 表示缺少数据，不按达标或不达标处理 */
  status: "PASS" | "WARNING" | "FAIL" | "UNKNOWN";
  note: string;
}

export interface TwelveMetricsResult {
  categoryName: string;
  overallStatus: "GO" | "OPTIMIZE_SHORTBOARD" | "DROP" | "INCOMPLETE_DATA";
  summary: string;
  computedStats: {
    top10AvgMonthlySales: number | null;
    top10MedianReviews: number | null;
    top10MedianPriceUsd: number | null;
    lowRatingCountBelow42: number;
  };
  checks: MetricCheckItem[];
  shortboards: string[];
  /** 缺失数据的指标清单 */
  missingData: string[];
}

/** 3. 12 项指标深度评估与短板诊断 */
export function evaluate12Metrics(input: TwelveMetricsInput): TwelveMetricsResult {
  const grossMarginPct =
    typeof input.grossMarginPct === "number" && Number.isFinite(input.grossMarginPct)
      ? input.grossMarginPct
      : null;
  const sizeTier = input.sizeTier ?? null;
  const avgSales = average(input.top10MonthlySales);
  const medianReviews = median(input.top10ReviewCounts);
  const medianPrice = median(input.top10PricesUsd);
  const lowRatingCount = input.top10Ratings.filter((r) => r < 4.2).length;
  const allHighRating = input.top10Ratings.length > 0 && input.top10Ratings.every((r) => r >= 4.6);

  const checks: MetricCheckItem[] = [
    {
      id: 1,
      name: "核心词搜索量",
      value: `${input.totalMonthlySearchVolume.toLocaleString()} /月`,
      benchmark: "≥ 50,000 /月",
      status: input.totalMonthlySearchVolume >= 50000 ? "PASS" : "FAIL",
      note: input.totalMonthlySearchVolume >= 50000 ? "市场搜索基础充足" : "搜索盘子偏小",
    },
    {
      id: 2,
      name: "头部平均月销量",
      value: avgSales !== null ? `${avgSales} 件/月` : "未知",
      benchmark: "≥ 300 件/月 (进场门槛，非首年目标)",
      status: avgSales !== null && avgSales >= 300 ? "PASS" : "FAIL",
      note: avgSales !== null && avgSales >= 300 ? "头部出单能力达标" : "头部销量不足300件",
    },
    {
      id: 3,
      name: "搜索分散度 (最大词占比)",
      value: `${input.maxKeywordTrafficSharePct}%`,
      benchmark: "< 40%",
      status:
        input.maxKeywordTrafficSharePct < 40
          ? "PASS"
          : input.maxKeywordTrafficSharePct <= 55
            ? "WARNING"
            : "FAIL",
      note:
        input.maxKeywordTrafficSharePct < 40
          ? "流量分布健康"
          : "大词流量过于集中，抢不到核心词就没流量",
    },
    {
      id: 4,
      name: "头部评论数中位数",
      value: medianReviews !== null ? `${medianReviews} 条` : "未知",
      benchmark: "< 500 易切入；500-2000 需差异化；> 2000 谨慎",
      status:
        medianReviews === null
          ? "FAIL"
          : medianReviews < 500
            ? "PASS"
            : medianReviews <= 2000
              ? "WARNING"
              : "FAIL",
      note:
        medianReviews === null
          ? "缺少评论数据"
          : medianReviews < 500
            ? "评论门槛低，容易切入"
            : medianReviews <= 2000
              ? "必须通过差异化切入"
              : "老品护城河极深，新手慎入",
    },
    {
      id: 5,
      name: "头部星级分布",
      value: `低于4.2星: ${lowRatingCount} 个`,
      benchmark: "有 2-3 个 < 4.2 星存在痛点机会",
      status: lowRatingCount >= 2 ? "PASS" : allHighRating ? "WARNING" : "PASS",
      note:
        lowRatingCount >= 2
          ? "存在明显未解决的用户痛点，可结合买家评论洞察切入"
          : allHighRating
            ? "头部全在 4.6 星以上，产品成熟度高，较难做差异化"
            : "星级分布一般",
    },
    {
      id: 6,
      name: "品牌集中度",
      value: `最高单一品牌占比 ${input.topBrandSharePct}%`,
      benchmark: "< 30%",
      status: input.topBrandSharePct < 30 ? "PASS" : "FAIL",
      note: input.topBrandSharePct < 30 ? "未形成品牌垄断" : "头部品牌垄断严重",
    },
    {
      id: 7,
      name: "近半年新品存活数",
      value: `${input.newEntrantsLast6Months} 个`,
      benchmark: "≥ 3 个",
      status: input.newEntrantsLast6Months >= 3 ? "PASS" : "WARNING",
      note:
        input.newEntrantsLast6Months >= 3
          ? "市场对新品友好，头部未固化"
          : "新品难以挤进首页，赛道壁垒偏高",
    },
    {
      id: 8,
      name: "价格带 (中位售价)",
      value: medianPrice !== null ? `$${medianPrice}` : "未知",
      benchmark: "$20 - $60",
      status:
        medianPrice !== null && medianPrice >= 20 && medianPrice <= 60 ? "PASS" : "WARNING",
      note:
        medianPrice !== null && medianPrice < 20
          ? "低价通货区间，易撞车 Haul 且利润薄"
          : medianPrice !== null && medianPrice > 60
            ? "高客单价决策门槛重"
            : "新手友好价格带",
    },
    {
      id: 9,
      name: "费后毛利率",
      value: grossMarginPct !== null ? `${grossMarginPct}%` : "未知",
      benchmark: "≥ 35%（留出 10%-15% 广告与 15%-20% 净利）",
      status:
        grossMarginPct === null
          ? "UNKNOWN"
          : grossMarginPct >= 35
            ? "PASS"
            : grossMarginPct >= 30
              ? "WARNING"
              : "FAIL",
      note:
        grossMarginPct === null
          ? "缺少利润测算数据，请先调用 calculate_profit_and_fba"
          : grossMarginPct >= 35
            ? "毛利达标"
            : "毛利低于 35% 合格线，需尝试通过套装/差异化提高客单价",
    },
    {
      id: 10,
      name: "物流尺寸分级",
      value: sizeTier !== null ? SIZE_TIER_LABELS[sizeTier] : "未知",
      benchmark: "优先小号标准件，避开大件",
      status:
        sizeTier === null
          ? "UNKNOWN"
          : sizeTier === "small_standard"
            ? "PASS"
            : sizeTier === "large_standard"
              ? "WARNING"
              : "FAIL",
      note:
        sizeTier === null
          ? "缺少包装尺寸/重量数据"
          : sizeTier === "small_standard"
            ? "配送费最低档，物流成本友好"
            : sizeTier === "large_standard"
              ? "大号标准件，配送费偏高，注意体积重"
              : "大件/超大件，物流与仓储成本不可控，建议新手避开",
    },
    {
      id: 11,
      name: "合规与侵权排查",
      value: input.hasComplianceBlocker ? "存在阻塞风险" : "可控",
      benchmark: "无侵权硬伤，认证/责任险成本已入账",
      status: input.hasComplianceBlocker ? "FAIL" : "PASS",
      note: input.hasComplianceBlocker ? "存在侵权或无法解决的合规门槛" : "合规风险可控",
    },
    {
      id: 12,
      name: "退货风险前置信号",
      value: input.hasHighReturnRiskSignal ? "发现高频退货/经常退货标" : "暂无高退货预警",
      benchmark: "避开「经常退货」标记，低于类目退货处理费阈值",
      status: input.hasHighReturnRiskSignal ? "WARNING" : "PASS",
      note: input.topReturnReasons?.length
        ? `高频退货原因: ${input.topReturnReasons.join("、")}`
        : "需持续关注买家退货原因",
    },
  ];

  const failItems = checks.filter((c) => c.status === "FAIL");
  const warningItems = checks.filter((c) => c.status === "WARNING");
  const unknownItems = checks.filter((c) => c.status === "UNKNOWN");
  const shortboards = [...failItems, ...warningItems].map((c) => `${c.name}: ${c.note}`);
  const missingData = unknownItems.map((c) => `${c.name}: ${c.note}`);

  let overallStatus: TwelveMetricsResult["overallStatus"] = "GO";
  let summary = "全部核心指标表现健康，可推进打样与精细利润核算。";

  if (input.hasComplianceBlocker || failItems.length >= 3) {
    overallStatus = "DROP";
    summary = "存在合规硬伤或多项核心指标不达标，建议直接淘汰该品类。";
  } else if (failItems.length > 0 || warningItems.length > 0) {
    overallStatus = "OPTIMIZE_SHORTBOARD";
    summary = "存在局部短板，建议先针对短板设计差异化或套装溢价方案；若验证市场不买单再放弃。";
  } else if (unknownItems.length > 0) {
    overallStatus = "INCOMPLETE_DATA";
    summary = "已提供的指标表现健康，但仍有关键数据缺失，补齐后才能给出最终结论。";
  }

  return {
    categoryName: input.categoryName,
    overallStatus,
    summary,
    computedStats: {
      top10AvgMonthlySales: avgSales,
      top10MedianReviews: medianReviews,
      top10MedianPriceUsd: medianPrice,
      lowRatingCountBelow42: lowRatingCount,
    },
    checks,
    shortboards,
    missingData,
  };
}
