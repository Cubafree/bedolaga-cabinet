import i18next from 'i18next';
import type { PaymentMethod } from '../types';

/**
 * Glossary §6 / copy spec §D: the user picks a payment *type*, never an
 * acquirer brand. Map a backend method id (yookassa, freekassa_sbp, cryptobot,
 * telegram_stars, …) onto one of the three human types — СБП / Карта РФ /
 * Криптовалюта — plus Telegram Stars where applicable.
 *
 * Returns a `balance.details.method.*` translation when the id is recognised,
 * otherwise falls back to the per-method `balance.paymentMethods.*.name` key and
 * finally the raw API name. This keeps brand names (YooKassa/Tribute/Wata/…) out
 * of every user-facing label while staying data-driven.
 */
export type HumanMethodKind = 'sbp' | 'card' | 'crypto' | 'stars' | null;

export function classifyPaymentMethod(method: Pick<PaymentMethod, 'id' | 'name'>): HumanMethodKind {
  const id = method.id.toLowerCase();
  const name = (method.name || '').toLowerCase();
  const hay = `${id} ${name}`;

  if (hay.includes('stars') || hay.includes('звёзд') || hay.includes('звезд')) return 'stars';
  if (
    hay.includes('crypto') ||
    hay.includes('крипт') ||
    hay.includes('ton') ||
    hay.includes('usdt') ||
    hay.includes('heleket') ||
    hay.includes('cryptobot')
  )
    return 'crypto';
  if (
    hay.includes('sbp') ||
    hay.includes('сбп') ||
    hay.includes('fpgate') ||
    hay.includes('p2p') ||
    hay.includes('cashera')
  )
    return 'sbp';
  // Everything else with a card-ish signal → «Карта РФ».
  if (
    hay.includes('card') ||
    hay.includes('карт') ||
    hay.includes('yookassa') ||
    hay.includes('cloudpayments') ||
    hay.includes('tribute') ||
    hay.includes('mulenpay') ||
    hay.includes('platega') ||
    hay.includes('wata') ||
    hay.includes('pal24') ||
    hay.includes('antilopay')
  )
    return 'card';
  return null;
}

export function humanPaymentMethodLabel(method: Pick<PaymentMethod, 'id' | 'name'>): string {
  const kind = classifyPaymentMethod(method);
  if (kind) return i18next.t(`balance.details.method.${kind}`);
  const methodKey = method.id.toLowerCase().replace(/-/g, '_');
  const fallback = i18next.t(`balance.paymentMethods.${methodKey}.name`, { defaultValue: '' });
  return fallback || method.name;
}

export function humanPaymentMethodHint(method: Pick<PaymentMethod, 'id' | 'name'>): string | null {
  const kind = classifyPaymentMethod(method);
  if (!kind) return null;
  return i18next.t(`balance.details.method.${kind}Hint`, { defaultValue: '' }) || null;
}

export interface PaymentMethodDisplay {
  label: string;
  hint: string | null;
}

/**
 * Labels for a whole list of methods. A type that is offered once keeps the
 * generic label («Карта РФ»). When several methods share a type, generic labels
 * would be indistinguishable, so each falls back to `method.name` — the backend
 * fills it from the operator's display_name override (admin → payment methods),
 * so the operator controls the wording. An operator-set description always wins
 * over the generic hint.
 */
export function buildPaymentMethodDisplay(
  methods: ReadonlyArray<Pick<PaymentMethod, 'id' | 'name' | 'description'>>,
): Map<string, PaymentMethodDisplay> {
  const kindCounts = new Map<HumanMethodKind, number>();
  for (const method of methods) {
    const kind = classifyPaymentMethod(method);
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }
  const result = new Map<string, PaymentMethodDisplay>();
  for (const method of methods) {
    const kind = classifyPaymentMethod(method);
    const ambiguous = kind !== null && (kindCounts.get(kind) ?? 0) > 1;
    result.set(method.id, {
      label: ambiguous && method.name ? method.name : humanPaymentMethodLabel(method),
      hint: method.description || humanPaymentMethodHint(method),
    });
  }
  return result;
}
