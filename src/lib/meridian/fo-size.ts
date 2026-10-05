/**
 * IMP-39: a new NSE option open cannot exceed 1% of the mock book.
 * Existing clips are not flattened to comply. Crypto spot sizing does not use this gate.
 */
import { isCanonicalOption, isCryptoFo } from "./fo-contracts";

export const FO_OPTION_BOOK_FRAC = 0.01;
export const MOCK_BOOK_INR = 1_000_000;

/** New opens only. Never a reason to flatten a clip already on the book. */
export const FO_CAP_FLATTENS_EXISTING = false;

/** English skip. Ends with :paper. Null when the open is allowed. */
export function foOptionQtySkip(args: {
  symbol: string;
  qty: number;
  premiumInr: number;
  bookInr?: number;
}): string | null {
  if (isCryptoFo(args.symbol) || !isCanonicalOption(args.symbol)) return null;
  const qty = Number(args.qty);
  const px = Number(args.premiumInr);
  if (!(qty > 0) || !(px > 0)) return null;
  const book = args.bookInr && args.bookInr > 0 ? args.bookInr : MOCK_BOOK_INR;
  const cap = book * FO_OPTION_BOOK_FRAC;
  if (Math.abs(qty * px) > cap + 1e-6) {
    return "FO option notional above 1% of the mock book:paper";
  }
  return null;
}
