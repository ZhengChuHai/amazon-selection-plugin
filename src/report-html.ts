/**
 * 自包含的可视化选品报告 HTML 生成器：
 * - 零外部 CDN 依赖，内联 CSS 与 SVG 图标，离线双击即可在浏览器打开
 * - 包含：五因子 SVG 雷达图、2026 利润结构堆叠条、12 项指标体检表、短板诊断卡片
 */
import type { FiveFactorResult, ProfitResult, TwelveMetricsResult } from "./calculator.js";

export interface SelectionReportInput {
  categoryName: string;
  generatedAt?: string;
  fiveFactors?: {
    demand: number;
    competition: number;
    profit: number;
    compliance: number;
    operability: number;
    result: FiveFactorResult;
  };
  profit?: ProfitResult;
  metrics12?: TwelveMetricsResult;
  breakthroughNotes?: string[];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 生成五因子 SVG 雷达图（5 个顶点，0-5 分） */
function renderRadarSvg(scores: [number, number, number, number, number]): string {
  const labels = ["需求", "竞争", "利润", "合规", "可运营"];
  const cx = 140;
  const cy = 135;
  const rMax = 88;
  const angles = labels.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / 5);

  const polygonPoints = (radius: number) =>
    angles
      .map((a) => `${(cx + radius * Math.cos(a)).toFixed(1)},${(cy + radius * Math.sin(a)).toFixed(1)}`)
      .join(" ");

  const gridRings = [1, 2, 3, 4, 5]
    .map((level) => {
      const r = (rMax * level) / 5;
      return `<polygon points="${polygonPoints(r)}" fill="none" stroke="#e2e8f0" stroke-width="${level === 2 ? "1.5" : "1"}" ${level === 2 ? 'stroke-dasharray="4 3"' : ""} />`;
    })
    .join("");

  const axes = angles
    .map((a) => {
      const x = (cx + rMax * Math.cos(a)).toFixed(1);
      const y = (cy + rMax * Math.sin(a)).toFixed(1);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`;
    })
    .join("");

  const dataPoints = angles
    .map((a, i) => {
      const val = Math.max(0, Math.min(5, scores[i] ?? 0));
      const r = (rMax * val) / 5;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    })
    .join(" ");

  const dots = angles
    .map((a, i) => {
      const val = Math.max(0, Math.min(5, scores[i] ?? 0));
      const r = (rMax * val) / 5;
      const x = (cx + r * Math.cos(a)).toFixed(1);
      const y = (cy + r * Math.sin(a)).toFixed(1);
      const color = val <= 2 ? "#ef4444" : "#2563eb";
      return `<circle cx="${x}" cy="${y}" r="4.5" fill="${color}" stroke="#ffffff" stroke-width="1.5" />`;
    })
    .join("");

  const labelTags = angles
    .map((a, i) => {
      const r = rMax + 24;
      const x = (cx + r * Math.cos(a)).toFixed(1);
      const y = (cy + r * Math.sin(a) + 4).toFixed(1);
      return `<text x="${x}" y="${y}" text-anchor="middle" font-size="12" font-weight="600" fill="#334155">${labels[i]} (${scores[i]})</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 280 270" class="radar-svg" role="img" aria-label="五因子雷达图">
    ${gridRings}
    ${axes}
    <polygon points="${dataPoints}" fill="rgba(37, 99, 235, 0.16)" stroke="#2563eb" stroke-width="2" />
    ${dots}
    ${labelTags}
  </svg>`;
}

const ICONS = {
  logo: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  radar: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  dollar: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  checklist: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  alert: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  pass: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  fail: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  bulb: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>`,
};

/** 生成完整的选品可视化 HTML 字符串 */
export function generateSelectionReportHtml(input: SelectionReportInput): string {
  const title = escapeHtml(input.categoryName);
  const generatedAt = escapeHtml(input.generatedAt ?? new Date().toISOString().slice(0, 16).replace("T", " "));
  const ff = input.fiveFactors;
  const pr = input.profit;
  const m12 = input.metrics12;

  // 决定顶部总状态徽章
  let badgeClass = "badge-warn";
  let badgeText = "评估中";
  if (m12) {
    if (m12.overallStatus === "GO") {
      badgeClass = "badge-pass";
      badgeText = "建议推进 (GO)";
    } else if (m12.overallStatus === "DROP") {
      badgeClass = "badge-fail";
      badgeText = "建议淘汰 (DROP)";
    } else if (m12.overallStatus === "INCOMPLETE_DATA") {
      badgeClass = "badge-warn";
      badgeText = "数据不全 · 待补充";
    } else {
      badgeClass = "badge-warn";
      badgeText = "存在短板 · 需优化破局";
    }
  } else if (ff) {
    if (ff.result.decision === "PASS") {
      badgeClass = "badge-pass";
      badgeText = "五因子初筛通过";
    } else {
      badgeClass = "badge-fail";
      badgeText = ff.result.decision === "VETO_ZERO" ? "一票否决 (0分)" : "初筛淘汰 (≤2分)";
    }
  }

  // 利润结构堆叠条计算
  const profitBarHtml = pr
    ? (() => {
        const p = pr.priceUsd || 1;
        const pct = (v: number) => Math.max(0, Number(((v / p) * 100).toFixed(1)));
        const purchaseP = pct(pr.purchaseCostUsd + pr.shippingToFbaUsd + pr.tariffUsd);
        const amzP = pct(pr.referralFeeUsd + pr.fbaFeeUsd);
        const compP = pct(pr.complianceAndInsurancePerUnitUsd);
        const adP = pct(pr.estimatedAdCostUsd);
        const netP = Math.max(0, Number((100 - purchaseP - amzP - compP - adP).toFixed(1)));
        return `
          <div class="stack-bar" title="售价构成占比">
            <div class="seg seg-purchase" style="width:${purchaseP}%" title="采购/头程/关税 ${purchaseP}%"></div>
            <div class="seg seg-amz" style="width:${amzP}%" title="亚马逊佣金+FBA ${amzP}%"></div>
            ${compP > 0 ? `<div class="seg seg-comp" style="width:${compP}%" title="合规/责任险 ${compP}%"></div>` : ""}
            <div class="seg seg-ad" style="width:${adP}%" title="预留广告 ${adP}%"></div>
            <div class="seg seg-net" style="width:${netP}%" title="预估净利 ${netP}%"></div>
          </div>
          <div class="stack-legend">
            <span><i class="dot seg-purchase"></i>采购/头程/关税 ${purchaseP}%</span>
            <span><i class="dot seg-amz"></i>亚马逊费用 ${amzP}%</span>
            ${compP > 0 ? `<span><i class="dot seg-comp"></i>合规/险 ${compP}%</span>` : ""}
            <span><i class="dot seg-ad"></i>预留广告 ${adP}%</span>
            <span><i class="dot seg-net"></i>预估净利 ${netP}%</span>
          </div>
        `;
      })()
    : `<p class="muted">暂无利润测算数据</p>`;

  const warningsAll = [
    ...(ff?.result.warnings2026 ?? []),
    ...(pr?.warnings ?? []),
  ];

  const shortboards = m12?.shortboards ?? [];
  const missingData = m12?.missingData ?? [];
  const breakthroughs = input.breakthroughNotes ?? [];

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>亚马逊选品评估报告 - ${title}</title>
  <style>
    :root {
      --bg: #f1f5f9;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --primary: #2563eb;
      --pass-bg: #dcfce7;
      --pass-fg: #166534;
      --warn-bg: #fef3c7;
      --warn-fg: #92400e;
      --fail-bg: #fee2e2;
      --fail-fg: #991b1b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.55;
    }
    .topbar {
      background: #0f172a;
      color: #f8fafc;
      padding: 18px 28px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: rgba(37, 99, 235, 0.25);
      color: #60a5fa;
      display: grid;
      place-items: center;
    }
    .brand h1 {
      margin: 0;
      font-size: 19px;
      font-weight: 700;
    }
    .brand p {
      margin: 2px 0 0;
      font-size: 12px;
      color: #94a3b8;
    }
    .container {
      max-width: 1180px;
      margin: 24px auto;
      padding: 0 20px 40px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .kpi-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px 18px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .kpi-label {
      font-size: 12px;
      color: var(--muted);
      font-weight: 600;
    }
    .kpi-value {
      font-size: 26px;
      font-weight: 800;
      margin: 6px 0 4px;
      letter-spacing: -0.02em;
    }
    .kpi-sub {
      font-size: 12px;
      color: var(--muted);
    }
    .two-col {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 20px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px 22px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .card-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 700;
      margin: 0;
    }
    .card-title svg { color: var(--primary); }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 11px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .badge-pass { background: var(--pass-bg); color: var(--pass-fg); }
    .badge-warn { background: var(--warn-bg); color: var(--warn-fg); }
    .badge-fail { background: var(--fail-bg); color: var(--fail-fg); }
    .radar-wrap {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 18px;
    }
    .radar-svg {
      width: 240px;
      height: 230px;
      flex-shrink: 0;
    }
    .factor-bars {
      flex: 1;
      min-width: 180px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .bar-row-head {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .bar-track {
      height: 8px;
      background: #e2e8f0;
      border-radius: 999px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 999px;
      background: var(--primary);
    }
    .bar-fill.low { background: #ef4444; }
    .stack-bar {
      display: flex;
      height: 16px;
      border-radius: 999px;
      overflow: hidden;
      background: #e2e8f0;
      margin: 6px 0 12px;
    }
    .seg-purchase { background: #f59e0b; }
    .seg-amz { background: #3b82f6; }
    .seg-comp { background: #8b5cf6; }
    .seg-ad { background: #ec4899; }
    .seg-net { background: #10b981; }
    .stack-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 16px;
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 16px;
    }
    .dot {
      display: inline-block;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      margin-right: 5px;
    }
    .kv-list {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px 16px;
      font-size: 13px;
    }
    .kv-list .k { color: var(--muted); }
    .kv-list .v { font-weight: 600; text-align: right; }
    .kv-divider {
      grid-column: 1 / -1;
      border-top: 1px dashed var(--border);
      margin: 4px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      text-align: left;
      padding: 10px 12px;
      background: #f8fafc;
      color: var(--muted);
      font-weight: 600;
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 11px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    tr:last-child td { border-bottom: none; }
    .alert-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
      border-radius: 12px;
      padding: 14px 16px;
      font-size: 13px;
    }
    .alert-title {
      display: flex;
      align-items: center;
      gap: 7px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    ul.clean {
      margin: 6px 0 0;
      padding-left: 18px;
    }
    ul.clean li { margin-bottom: 4px; }
    .muted { color: var(--muted); font-size: 13px; }
    .footer-note {
      text-align: center;
      font-size: 12px;
      color: var(--muted);
      margin-top: 8px;
    }
    @media print {
      body { background: #ffffff; }
      .topbar { background: #ffffff; color: #0f172a; border-bottom: 2px solid #0f172a; }
      .card, .kpi-card { box-shadow: none; break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <div class="brand-icon">${ICONS.logo}</div>
      <div>
        <h1>亚马逊选品评估报告：${title}</h1>
        <p>五因子快速排除 + 12 项指标深度体检 + 2026 费率与关税测算 · 生成时间 ${generatedAt}</p>
      </div>
    </div>
    <span class="badge ${badgeClass}">${escapeHtml(badgeText)}</span>
  </header>

  <main class="container">
    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">五因子相乘总分</div>
        <div class="kpi-value">${ff ? `${ff.result.totalScore} / 3125` : "--"}</div>
        <div class="kpi-sub">${ff ? escapeHtml(ff.result.decisionLabel) : "未提供五因子打分"}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">2026 费后毛利率</div>
        <div class="kpi-value" style="color:${pr ? (pr.grossMarginPass ? "#166534" : "#991b1b") : "inherit"}">${pr ? `${pr.grossMarginPct}%` : "--"}</div>
        <div class="kpi-sub">${pr ? `参考线 ≥ 35% · 净利预估 ${pr.netMarginPct}%` : "未提供毛利测算"}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">头部评论数中位数</div>
        <div class="kpi-value">${m12?.computedStats.top10MedianReviews !== null && m12?.computedStats.top10MedianReviews !== undefined ? `${m12.computedStats.top10MedianReviews} 条` : "--"}</div>
        <div class="kpi-sub">&lt;500 易切入 · 500–2000 需差异化</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">头部前 10 平均月销</div>
        <div class="kpi-value">${m12?.computedStats.top10AvgMonthlySales !== null && m12?.computedStats.top10AvgMonthlySales !== undefined ? `${m12.computedStats.top10AvgMonthlySales} 件` : "--"}</div>
        <div class="kpi-sub">进场门槛 ≥ 300 件/月（非首年目标）</div>
      </div>
    </section>

    <section class="two-col">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">${ICONS.radar} 五因子初筛模型 (相乘)</h2>
          ${ff ? `<span class="badge ${ff.result.decision === "PASS" ? "badge-pass" : "badge-fail"}">${ff.result.decision}</span>` : ""}
        </div>
        ${
          ff
            ? `<div class="radar-wrap">
                ${renderRadarSvg([ff.demand, ff.competition, ff.profit, ff.compliance, ff.operability])}
                <div class="factor-bars">
                  ${[
                    ["需求够大", ff.demand],
                    ["竞争可进", ff.competition],
                    ["利润够厚", ff.profit],
                    ["合规可做", ff.compliance],
                    ["自己能运营", ff.operability],
                  ]
                    .map(
                      ([name, val]) => `
                    <div>
                      <div class="bar-row-head"><span>${name}</span><span>${val} / 5</span></div>
                      <div class="bar-track"><div class="bar-fill ${Number(val) <= 2 ? "low" : ""}" style="width:${Number(val) * 20}%"></div></div>
                    </div>`,
                    )
                    .join("")}
                </div>
              </div>`
            : `<p class="muted">未传入五因子数据</p>`
        }
      </div>

      <div class="card">
        <div class="card-header">
          <h2 class="card-title">${ICONS.dollar} 2026 利润与费用结构拆解</h2>
          ${pr ? `<span class="badge ${pr.grossMarginPass ? "badge-pass" : "badge-fail"}">${escapeHtml(pr.sizeTierLabel)}</span>` : ""}
        </div>
        ${profitBarHtml}
        ${
          pr
            ? `<div class="kv-list">
                <span class="k">预期售价</span><span class="v">$${pr.priceUsd.toFixed(2)}</span>
                <span class="k">采购成本 (占售价 ${pr.purchaseRatioPct}%)</span><span class="v">-$${pr.purchaseCostUsd.toFixed(2)}</span>
                <span class="k">头程运费</span><span class="v">-$${pr.shippingToFbaUsd.toFixed(2)}</span>
                <span class="k">2026 HS 关税</span><span class="v">-$${pr.tariffUsd.toFixed(2)}</span>
                <span class="k">亚马逊佣金</span><span class="v">-$${pr.referralFeeUsd.toFixed(2)}</span>
                <span class="k">FBA 配送费 (${pr.fbaFeeSource === "override" ? "后台计算器精确值" : "2026参考估算"})</span><span class="v">-$${pr.fbaFeeUsd.toFixed(2)}</span>
                <span class="k">认证/商业责任险摊销</span><span class="v">-$${pr.complianceAndInsurancePerUnitUsd.toFixed(2)}</span>
                <div class="kv-divider"></div>
                <span class="k"><strong>费后毛利 / 毛利率</strong></span><span class="v" style="color:${pr.grossMarginPass ? "#166534" : "#991b1b"}">$${pr.grossProfitUsd.toFixed(2)} (${pr.grossMarginPct}%)</span>
                <span class="k">预留广告后净利</span><span class="v">$${pr.netProfitUsd.toFixed(2)} (${pr.netMarginPct}%)</span>
              </div>`
            : ""
        }
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <h2 class="card-title">${ICONS.checklist} 12 项核心指标深度体检表</h2>
        ${m12 ? `<span class="badge ${m12.overallStatus === "GO" ? "badge-pass" : m12.overallStatus === "DROP" ? "badge-fail" : "badge-warn"}">${m12.overallStatus}</span>` : ""}
      </div>
      ${
        m12
          ? `<table>
              <thead>
                <tr>
                  <th style="width:20%">指标名称</th>
                  <th style="width:18%">实测值</th>
                  <th style="width:22%">经验参考线</th>
                  <th style="width:12%">状态</th>
                  <th>诊断说明</th>
                </tr>
              </thead>
              <tbody>
                ${m12.checks
                  .map((c) => {
                    const cls = c.status === "PASS" ? "badge-pass" : c.status === "FAIL" ? "badge-fail" : "badge-warn";
                    const icon = c.status === "PASS" ? ICONS.pass : c.status === "FAIL" ? ICONS.fail : ICONS.alert;
                    const label =
                      c.status === "PASS"
                        ? "达标"
                        : c.status === "FAIL"
                          ? "不达标"
                          : c.status === "UNKNOWN"
                            ? "数据缺失"
                            : "需注意";
                    return `<tr>
                      <td><strong>${escapeHtml(c.name)}</strong></td>
                      <td>${escapeHtml(c.value)}</td>
                      <td class="muted">${escapeHtml(c.benchmark)}</td>
                      <td><span class="badge ${cls}">${icon} ${label}</span></td>
                      <td class="muted">${escapeHtml(c.note)}</td>
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>`
          : `<p class="muted">暂未提供 12 项指标精筛数据。</p>`
      }
    </section>

    ${
      warningsAll.length > 0 || shortboards.length > 0 || missingData.length > 0 || breakthroughs.length > 0
        ? `<section class="card">
            <div class="card-header">
              <h2 class="card-title">${ICONS.bulb} 短板诊断、2026 风险预警与破局建议</h2>
            </div>
            ${
              warningsAll.length > 0
                ? `<div class="alert-box" style="margin-bottom:14px">
                    <div class="alert-title">${ICONS.alert} 2026 合规 / 价格带 / 利润预警</div>
                    <ul class="clean">${warningsAll.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>
                  </div>`
                : ""
            }
            ${
              shortboards.length > 0
                ? `<div style="margin-bottom:12px"><strong>当前识别短板：</strong><ul class="clean">${shortboards.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul></div>`
                : ""
            }
            ${
              missingData.length > 0
                ? `<div style="margin-bottom:12px"><strong>待补充数据：</strong><ul class="clean">${missingData.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul></div>`
                : ""
            }
            ${
              breakthroughs.length > 0
                ? `<div><strong>破局 / 差异化建议：</strong><ul class="clean">${breakthroughs.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul></div>`
                : ""
            }
          </section>`
        : ""
    }

    <div class="alert-box">
      <div class="alert-title">${ICONS.alert} 人工终审兜底提醒</div>
      <div>本报告中的关税与侵权检索为 AI 初筛结果。正式下单开模或大批量备货前，请务必：1) 找货代/报关行确认最终 10 位 HTS 申报编码；2) 委托知产代理做一次美国外观专利人工复核。</div>
    </div>

    <div class="footer-note">Generated by amazon-selection-plugin · 可直接在浏览器按 Ctrl/Cmd+P 导出为 PDF 存档</div>
  </main>
</body>
</html>`;
}
