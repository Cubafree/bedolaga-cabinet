import { useTranslation } from 'react-i18next';
import { useCurrency } from '../../../hooks/useCurrency';
import { useHaptic } from '../../../platform';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────────────
// PeriodSelector  (NOTES_purchase_redesign §5)
//
// Fully DATA-DRIVEN inline period picker. Renders whatever periods the
// API returns — NO hardcoded 1/6/12. The owner is adding 3-day & week
// tariffs server-side, so the UI must handle any set (including very
// short periods) and any count.
//
//   - sorted ascending by `days`
//   - each segment: label · price (promo: accent + strike orig) ·
//     discount badge (top-right) · per-month (mono)
//   - best-value pre-select is the PARENT's job (it owns `value`); this
//     component only renders + emits onChange. It does surface the
//     «выгодно» pill on the highest-discount segment.
//   - ≤3 periods → 3-col grid; >3 → horizontal scroll-snap row.
//   - haptic light-impact on select (Mini App).
//
// The parent normalizes both TariffPeriod (tariffs mode) and
// PeriodOption (classic mode) into PeriodChoice[] so this stays
// decoupled from the two backend shapes.
// ──────────────────────────────────────────────────────────────────

export interface PeriodChoice {
  /** Stable key + the canonical day count. */
  days: number;
  /** Human label, e.g. «6 мес» / «3 дня» / «1 неделя». */
  label: string;
  /** Final price after promo (kopeks). */
  priceKopeks: number;
  /** Original price before promo (kopeks) — render strike + accent when > price. */
  originalKopeks?: number;
  /** Discount percent for the badge (omit/0 → no badge). */
  discountPercent?: number;
  /** Per-month price (kopeks) for the mono sub-line. */
  perMonthKopeks: number;
  /** Promo-group (green) vs time-limited promo (amber) hue — keeps the existing 2-hue logic. */
  isPromoGroup?: boolean;
}

interface PeriodSelectorProps {
  periods: PeriodChoice[];
  /** Selected day count (controlled). */
  value: number | null;
  onChange: (choice: PeriodChoice) => void;
  className?: string;
}

export function PeriodSelector({ periods, value, onChange, className }: PeriodSelectorProps) {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();
  const { impact } = useHaptic();

  const formatPrice = (kopeks: number) =>
    kopeks === 0
      ? t('subscription.free', 'Бесплатно')
      : `${formatAmount(kopeks / 100)} ${currencySymbol}`;

  // Always render ascending — the API order is not guaranteed.
  const sorted = [...periods].sort((a, b) => a.days - b.days);

  // The «выгодно» pill lands on the single highest-discount segment.
  const bestValueDays = sorted.reduce<number | null>((best, p) => {
    const pct = p.discountPercent ?? 0;
    if (pct <= 0) return best;
    const bestPct = sorted.find((s) => s.days === best)?.discountPercent ?? -1;
    return pct > bestPct ? p.days : best;
  }, null);

  if (sorted.length === 0) return null;

  const handleSelect = (choice: PeriodChoice) => {
    impact('light');
    onChange(choice);
  };

  return (
    <div className={cn('grid grid-cols-2 gap-2.5 sm:grid-cols-3', className)}>
      {sorted.map((period) => {
        const selected = value === period.days;
        const hasPromo = !!period.discountPercent && period.discountPercent > 0;
        const hasStrike =
          period.originalKopeks !== undefined && period.originalKopeks > period.priceKopeks;
        const isBestValue = period.days === bestValueDays;

        return (
          <button
            key={period.days}
            type="button"
            onClick={() => handleSelect(period)}
            aria-pressed={selected}
            className={cn(
              'relative min-h-[44px] rounded-2xl border p-3 text-center transition-all',
              selected
                ? 'border-accent-500 bg-accent-500/10 ring-1 ring-accent-500/30'
                : 'border-champagne-300 bg-champagne-50 hover:border-champagne-400 dark:border-dark-700/50 dark:bg-dark-800/50 dark:hover:border-dark-600',
            )}
          >
            {/* Discount badge — green for promo-group, amber for time-limited. */}
            {hasPromo && (
              <span
                className={cn(
                  'absolute -right-1.5 -top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm',
                  period.isPromoGroup ? 'bg-success-500' : 'bg-warning-400',
                )}
              >
                −{period.discountPercent}%
              </span>
            )}

            {/* «выгодно» pill on the best-value segment. */}
            {isBestValue && (
              <span className="absolute -left-1 -top-2 rounded-full bg-accent-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow-sm">
                {t('subscription.bestValue', 'выгодно')}
              </span>
            )}

            <div className="text-sm font-semibold text-champagne-900 dark:text-dark-100">
              {period.label}
            </div>

            <div className="mt-0.5 flex flex-col items-center">
              <span
                className={cn(
                  'font-display text-base font-bold',
                  hasStrike
                    ? 'text-accent-600 dark:text-accent-400'
                    : 'text-champagne-900 dark:text-dark-100',
                )}
              >
                {formatPrice(period.priceKopeks)}
              </span>
              {hasStrike && (
                <span className="text-[11px] text-champagne-500 line-through dark:text-dark-500">
                  {formatPrice(period.originalKopeks!)}
                </span>
              )}
            </div>

            <div className="mt-0.5 font-mono text-[11px] text-champagne-600 dark:text-dark-400">
              {formatPrice(period.perMonthKopeks)}
              {t('subscription.perMonth', '/мес')}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default PeriodSelector;
