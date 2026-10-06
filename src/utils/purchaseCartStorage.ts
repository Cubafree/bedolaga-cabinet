// ──────────────────────────────────────────────────────────────────
// purchaseCartStorage
//
// Client-side "saved order" for the top-up-and-resume loop on the
// consolidated purchase screen (/subscription/buy). Mirrors the
// existing `topUpStorage.ts` sessionStorage pattern exactly.
//
// Flow (NOTES_purchase_redesign §4): when the user taps «Пополнить Δ ₽
// и оплатить» we persist the in-progress order, send them to the
// existing top-up flow with `amount`+`returnTo`+`resume=1`, and on
// return restore the order so the pay bar can re-derive «оплатить с
// баланса». No backend endpoint — purely frontend persistence.
//
// Both tariffs-mode and classic-mode orders are representable:
//   - tariffs mode  → { mode:'tariff', tariffId, periodDays, trafficGb? }
//   - classic mode  → { mode:'classic', selection }
// ──────────────────────────────────────────────────────────────────

import type { PurchaseSelection } from '../types';

const STORAGE_KEY = 'purchase_pending_cart';
const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes (spec §4.2 TTL)

export interface PurchaseCart {
  /** Discriminates the two purchase backends. */
  mode: 'tariff' | 'classic';
  /** tariffs-mode: the chosen tariff. */
  tariffId?: number;
  /** tariffs-mode: resolved day count (period or custom days). */
  periodDays?: number;
  /** tariffs-mode: optional custom traffic add-on. */
  trafficGb?: number;
  /** classic-mode: the full preview/submit selection. */
  selection?: PurchaseSelection;
  /** The subscription being renewed (omitted for a fresh purchase). */
  subscriptionId?: number;
  /** Snapshot of the total at save time (kopeks) — sanity check on resume. */
  totalKopeks: number;
  /** Date.now() at save. */
  savedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function savePurchaseCart(cart: Omit<PurchaseCart, 'savedAt'>): void {
  try {
    const payload: PurchaseCart = { ...cart, savedAt: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage may be unavailable (private mode / quota) — non-fatal:
    // the worst case is the resume loop falls back to a manual re-pick.
  }
}

export function loadPurchaseCart(): PurchaseCart | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      (parsed.mode !== 'tariff' && parsed.mode !== 'classic') ||
      typeof parsed.totalKopeks !== 'number' ||
      typeof parsed.savedAt !== 'number'
    ) {
      return null;
    }
    // Discard stale entries.
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearPurchaseCart();
      return null;
    }
    return {
      mode: parsed.mode,
      tariffId: typeof parsed.tariffId === 'number' ? parsed.tariffId : undefined,
      periodDays: typeof parsed.periodDays === 'number' ? parsed.periodDays : undefined,
      trafficGb: typeof parsed.trafficGb === 'number' ? parsed.trafficGb : undefined,
      selection: isRecord(parsed.selection) ? (parsed.selection as PurchaseSelection) : undefined,
      subscriptionId: typeof parsed.subscriptionId === 'number' ? parsed.subscriptionId : undefined,
      totalKopeks: parsed.totalKopeks,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearPurchaseCart(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
