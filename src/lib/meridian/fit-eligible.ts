/**
 * Default fit membership. The samples file is never rewritten.
 * Crypto spot stays in. 13 Sep gross labels, model quotes, and option/FUT rows stay out
 * unless the caller opts in. An opt-in INR row is kept only when that row already
 * stored a finite USDINR and a converted pnl_usd. No FX rate is invented.
 */
import { istCalendarDay } from "./daily-book";
import { parseFo } from "./fo-contracts";

export const SEP13_GROSS_IST = "2026-09-13";

export type FitSkip =
  | "sep13_gross_label"
  | "model_quote"
  | "option_or_fut"
  | "inr_pnl_no_fx";

export type FitReadOpts = {
  /** Primary fit excludes quoteLabel "model". Set true only for an explicit side study. */
  includeModelQuotes?: boolean;
  /**
   * Default false: option and FUT rows are held out.
   * True keeps a row only when storedInrConverts is true. Never synthesises USDINR.
   */
  includeInrWithFx?: boolean;
};

export type FitCandidate = {
  symbol?: unknown;
  quoteLabel?: unknown;
  quote_label?: unknown;
  label?: unknown;
  y?: unknown;
  fwdRetGross?: unknown;
  fwd_ret_gross?: unknown;
  tsClose?: unknown;
  ts_close?: unknown;
  closed_ist?: unknown;
  closedIst?: unknown;
  pnl?: unknown;
  pnl_usd?: unknown;
  usd_inr?: unknown;
  usdInr?: unknown;
};

function closeIstDay(row: FitCandidate): string | null {
  const stamp = row.closed_ist ?? row.closedIst;
  if (typeof stamp === "string" && /^\d{4}-\d{2}-\d{2}/.test(stamp)) return stamp.slice(0, 10);
  const ts = row.tsClose ?? row.ts_close;
  const ms = typeof ts === "number" ? ts : typeof ts === "string" ? Date.parse(ts) : NaN;
  if (!Number.isFinite(ms)) return null;
  return istCalendarDay(ms);
}

/** 13 Sep 2026 rows whose training label follows fwdRetGross, not the net forward return. */
export function isSep13GrossLabel(row: FitCandidate): boolean {
  if (closeIstDay(row) !== SEP13_GROSS_IST) return false;
  const gross = Number(row.fwdRetGross ?? row.fwd_ret_gross);
  if (!Number.isFinite(gross)) return false;
  const lab = row.label === 0 || row.label === 1 ? row.label : row.y === 0 || row.y === 1 ? row.y : null;
  if (lab == null) return false;
  return lab === (gross > 0 ? 1 : 0);
}

/** Dated option, dated or short future, or a perp. Crypto spot (BTC, PEPE, APE) is false. */
export function isOptionOrFutSymbol(symbol: unknown): boolean {
  const u = String(symbol ?? "").trim().toUpperCase();
  if (!u) return false;
  if (u.endsWith("PERP") || u.endsWith("FUT")) return true;
  const fo = parseFo(u);
  if (!fo) return false;
  return fo.right === "CE" || fo.right === "PE" || fo.right === "FUT";
}

/**
 * True only when the row already carries a finite USDINR and pnl_usd equals pnl / that print.
 * Equal pnl and pnl_usd is the unconverted historical bug. No fallback rate.
 */
export function storedInrConverts(row: FitCandidate): boolean {
  const fx = Number(row.usd_inr ?? row.usdInr);
  if (!Number.isFinite(fx) || !(fx > 0)) return false;
  const pnl = Number(row.pnl);
  const usd = Number(row.pnl_usd);
  if (!Number.isFinite(pnl) || !Number.isFinite(usd)) return false;
  if (Math.abs(pnl - usd) <= 1e-9) return false;
  const expect = pnl / fx;
  const tol = 1e-6 * Math.max(1, Math.abs(expect));
  return Math.abs(usd - expect) <= tol;
}

/** Null means the row stays in the default fit. Does not rewrite reasons or quote labels. */
export function fitSkipReason(row: FitCandidate, opts: FitReadOpts = {}): FitSkip | null {
  if (isSep13GrossLabel(row)) return "sep13_gross_label";
  const quote = String(row.quoteLabel ?? row.quote_label ?? "").toLowerCase();
  if (quote === "model" && !opts.includeModelQuotes) return "model_quote";
  if (isOptionOrFutSymbol(row.symbol)) {
    if (!opts.includeInrWithFx) return "option_or_fut";
    return storedInrConverts(row) ? null : "inr_pnl_no_fx";
  }
  return null;
}
