/**
 * 通过本机 ego-browser 读取 1688 搜索结果页，按销量排序取前 3 个商品计算平均采购价。
 * 注意：1688 搜索通常需要浏览器里已有 1688 登录态；若遇登录页或滑块验证，直接提示用户手动完成后重试，不尝试绕过。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Offer1688Item {
  title: string;
  priceRmb: number;
  salesCount: number | null;
  salesText: string | null;
  url: string | null;
}

export interface Fetch1688Result {
  keyword: string;
  searchUrl: string;
  usdCnyRate: number;
  top3: Offer1688Item[];
  avgPriceRmb: number | null;
  avgPriceUsd: number | null;
  needLoginOrCaptcha: boolean;
  error: string | null;
}

export function egoBin(): string {
  if (process.env.EGO_BROWSER_BIN) return process.env.EGO_BROWSER_BIN;
  const local = path.join(os.homedir(), ".local/bin/ego-browser");
  return fs.existsSync(local) ? local : "ego-browser";
}

/** 解析 1688 销量文本，如 "已售1.2万+件" -> 12000、"30天成交350+笔" -> 350 */
export function parse1688Sales(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").replace(/(?:近\s*)?\d+\s*天/g, "");
  const m = /(?:已售|成交)?\s*(\d+(?:\.\d+)?)\s*(万)?/.exec(cleaned);
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  return m[2] === "万" ? Math.round(base * 10000) : Math.round(base);
}

/** 解析 1688 价格文本，如 "¥12.50" 或 "12.00 - 15.00"（区间取起始/中位） */
export function parse1688Price(text: string | null | undefined): number | null {
  if (!text) return null;
  const matches = [...text.replace(/,/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const valid = matches.filter((n) => Number.isFinite(n) && n > 0 && n < 100000);
  if (valid.length === 0) return null;
  // 1688 卡片常见阶梯价（如 ¥12.5 起），取第一个主展示价格
  return Number(valid[0]!.toFixed(2));
}

/** 从抓到的商品列表中按销量降序取前 3 个计算平均价格 */
export function computeTop3Average(
  items: Offer1688Item[],
  usdCnyRate = 7.2,
): { top3: Offer1688Item[]; avgPriceRmb: number | null; avgPriceUsd: number | null } {
  const valid = items.filter((it) => Number.isFinite(it.priceRmb) && it.priceRmb > 0);
  if (valid.length === 0) {
    return { top3: [], avgPriceRmb: null, avgPriceUsd: null };
  }
  const sorted = [...valid].sort((a, b) => (b.salesCount ?? -1) - (a.salesCount ?? -1));
  const top3 = sorted.slice(0, 3);
  const sumRmb = top3.reduce((acc, it) => acc + it.priceRmb, 0);
  const avgPriceRmb = Number((sumRmb / top3.length).toFixed(2));
  const avgPriceUsd = Number((avgPriceRmb / usdCnyRate).toFixed(2));
  return { top3, avgPriceRmb, avgPriceUsd };
}

function runEgo<T>(
  script: string,
  mark: string,
  timeoutMs = 45_000,
): Promise<{ value: T; error: null } | { value: null; error: string }> {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let done = false;
    const finish = (v: { value: T; error: null } | { value: null; error: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    const child = spawn(egoBin(), ["nodejs"], { stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ value: null, error: `ego-browser 超过 ${Math.round(timeoutMs / 1000)} 秒没有返回` });
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => finish({ value: null, error: `无法启动 ego-browser：${e.message}` }));
    child.on("close", (code) => {
      const line = `${out}\n${err}`.split("\n").find((l) => l.startsWith(mark));
      if (!line) {
        return finish({
          value: null,
          error: `ego-browser 未返回有效结果（退出码 ${code}）：${(err || out).trim().slice(-300)}`,
        });
      }
      try {
        finish({ value: JSON.parse(line.slice(mark.length)) as T, error: null });
      } catch (e) {
        finish({ value: null, error: `解析 ego-browser 输出失败：${(e as Error).message}` });
      }
    });
    child.stdin.end(script);
  });
}

interface RawEgoPayload {
  blocked: boolean;
  reason?: string;
  items: Array<{
    title: string;
    priceText: string;
    salesText: string | null;
    url: string | null;
  }>;
}

/** 使用本机 ego-browser 打开 1688 首页输入中文搜索（避免 URL UTF-8/GBK 乱码），按销量排序抓取前 3 名价格 */
export async function fetch1688Top3Price(
  keyword: string,
  usdCnyRate = 7.2,
): Promise<Fetch1688Result> {
  const cleanKw = keyword.trim();
  const searchUrl = "https://www.1688.com/";
  const MARK = "AAN_1688_JSON:";

  const script = `
    (async () => {
      await page.goto("https://www.1688.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2000);
      const curUrl0 = page.url();
      const bodyText0 = await page.evaluate(() => document.body?.innerText?.slice(0, 800) || "");
      if (curUrl0.includes("login.1688.com") || bodyText0.includes("请先登录") || (bodyText0.includes("验证") && bodyText0.includes("滑块"))) {
        console.log(${JSON.stringify(MARK)} + JSON.stringify({ blocked: true, reason: "需要登录 1688 或触发了安全验证，请在 ego-browser 中手动登录后重试", items: [] }));
        return;
      }

      // 通过页面搜索框输入中文并回车，由 1688 前端自动处理 GBK 编码，避免 URL 乱码
      const searchInput = page.locator('input#alisearch-input, input[name="keywords"], input[placeholder*="搜索"], input[type="search"]').first();
      await searchInput.waitFor({ state: "visible", timeout: 10000 });
      await searchInput.fill(${JSON.stringify(cleanKw)});
      await searchInput.press("Enter");
      await page.waitForLoadState("domcontentloaded", { timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(3500);

      const curUrl = page.url();
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 800) || "");
      if (curUrl.includes("login.1688.com") || bodyText.includes("请先登录") || (bodyText.includes("验证") && bodyText.includes("滑块"))) {
        console.log(${JSON.stringify(MARK)} + JSON.stringify({ blocked: true, reason: "需要登录 1688 或触发了安全验证，请在 ego-browser 中手动登录后重试", items: [] }));
        return;
      }

      // 尝试点击页面上的“销量”排序按钮
      const salesTab = page.locator('a:has-text("销量"), span:has-text("销量"), li:has-text("销量")').first();
      if (await salesTab.count().catch(() => 0)) {
        await salesTab.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2500);
      }

      const items = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[class*="offer"], [class*="search-offer-item"], .sm-offer-item, a[href*="detail.1688.com"]'));
        const seen = new Set();
        const out = [];
        for (const el of cards) {
          const card = el.closest('[class*="offer-item"], [class*="card"], li') || el;
          const text = (card.innerText || "").trim();
          if (!text || text.length < 6) continue;
          const priceMatch = text.match(/[¥￥]\\s*\\d+(?:\\.\\d+)?/);
          if (!priceMatch) continue;
          const linkEl = card.querySelector('a[href*="detail.1688.com"]') || (card.tagName === "A" ? card : null);
          const href = linkEl ? linkEl.getAttribute("href") : null;
          const key = href || text.slice(0, 40);
          if (seen.has(key)) continue;
          seen.add(key);
          const lines = text.split("\\n").map(s => s.trim()).filter(Boolean);
          const title = lines.find(l => !l.startsWith("¥") && !l.startsWith("￥") && l.length > 6) || lines[0] || "";
          const salesLine = lines.find(l => /已售|成交|件|笔/.test(l) && /\\d/.test(l)) || null;
          out.push({ title: title.slice(0, 80), priceText: priceMatch[0], salesText: salesLine, url: href });
          if (out.length >= 20) break;
        }
        return out;
      });
      console.log(${JSON.stringify(MARK)} + JSON.stringify({ blocked: false, items }));
    })().catch((e) => {
      console.log(${JSON.stringify(MARK)} + JSON.stringify({ blocked: true, reason: String(e), items: [] }));
    });
  `;

  const res = await runEgo<RawEgoPayload>(script, MARK, 45_000);
  if (res.error !== null) {
    return {
      keyword,
      searchUrl,
      usdCnyRate,
      top3: [],
      avgPriceRmb: null,
      avgPriceUsd: null,
      needLoginOrCaptcha: false,
      error: res.error,
    };
  }

  if (res.value.blocked) {
    return {
      keyword,
      searchUrl,
      usdCnyRate,
      top3: [],
      avgPriceRmb: null,
      avgPriceUsd: null,
      needLoginOrCaptcha: true,
      error: res.value.reason ?? "1688 页面需要登录或验证",
    };
  }

  const parsedItems: Offer1688Item[] = [];
  for (const raw of res.value.items) {
    const priceRmb = parse1688Price(raw.priceText);
    if (priceRmb === null) continue;
    parsedItems.push({
      title: raw.title,
      priceRmb,
      salesCount: parse1688Sales(raw.salesText),
      salesText: raw.salesText,
      url: raw.url,
    });
  }

  const { top3, avgPriceRmb, avgPriceUsd } = computeTop3Average(parsedItems, usdCnyRate);
  return {
    keyword,
    searchUrl,
    usdCnyRate,
    top3,
    avgPriceRmb,
    avgPriceUsd,
    needLoginOrCaptcha: false,
    error: top3.length === 0 ? "未从 1688 页面提取到有效商品价格，请检查关键词或页面结构" : null,
  };
}
