import { useTranslation } from 'react-i18next';
import { useCurrency } from '../../../hooks/useCurrency';
import { PillButton } from '../../ui/PillButton';
import { ArrowRightIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────────────
// PurchasePayBar  (NOTES_purchase_redesign §3 — the state matrix)
//
// One sticky, balance-aware bottom bar. Driven by
// (totalKopeks, balanceKopeks, isPending) + a few mode flags. Derives
// `missing = total - balance` and renders one of:
//
//   loading        → skeleton total, disabled «…»
//   free/zero-price → «Бесплатно» / «Подключить»
//   switch          → «Доплата N ₽» / «Перейти на тариф»
//   cannot-purchase → reason above bar, disabled
//   enough          → «Оплатить N ₽ с баланса»  (→)
//   not-enough      → «Не хватает Δ ₽» sub-line (red) / «Пополнить Δ ₽ и оплатить»
//   zero balance    → «Пополнить и оплатить»  (no «не хватает» noise)
//   paying          → spinner «Оплата…»
//
// Status-hue lockout: ONLY the «не хватает» sub-line + error text carry
// red. The pay button is ALWAYS accent-orange (PillButton primary),
// in every payable state. Chip/totals/chrome stay neutral champagne.
//
// On <lg: fixed full-width above the (hidden) tab bar. On ≥lg: a
// sticky right-rail card (the parent positions it; we just render the
// inner stack). All actions are owned by the parent — this bar only
// derives presentation + calls the right callback.
// ──────────────────────────────────────────────────────────────────

export interface PurchasePayBarProps {
  /** Total to pay (kopeks). */
  totalKopeks: number;
  /** Original (pre-promo) total for the strike line (kopeks). */
  originalTotalKopeks?: number;
  /** Wallet balance (kopeks) — from purchase-options.balance_kopeks. */
  balanceKopeks: number;
  /** Price/preview still resolving. */
  isLoading?: boolean;
  /** A pay/renew/submit mutation is in flight. */
  isPaying?: boolean;
  /** Backend says this can't be purchased for a non-balance reason. */
  cannotPurchase?: boolean;
  /** Reason shown above the bar when cannotPurchase. */
  cannotPurchaseReason?: string | null;
  /** Inline non-balance error shown above the bar. */
  errorMessage?: string | null;
  /** Switch/upgrade mode — bar shows «Доплата N ₽» / «Перейти на тариф». */
  isSwitch?: boolean;
  /** Fire the balance-funded purchase (enough state). */
  onPay: () => void;
  /** Top-up the shortfall then resume (not-enough / zero state). */
  onTopUpAndPay: () => void;
  /** Open the switch sheet (switch state). */
  onSwitch?: () => void;
  /** Desktop right-rail variant (no fixed positioning). */
  variant?: 'fixed' | 'rail';
  className?: string;
}

export function PurchasePayBar({
  totalKopeks,
  originalTotalKopeks,
  balanceKopeks,
  isLoading = false,
  isPaying = false,
  cannotPurchase = false,
  cannotPurchaseReason,
  errorMessage,
  isSwitch = false,
  onPay,
  onTopUpAndPay,
  onSwitch,
  variant = 'fixed',
  className,
}: PurchasePayBarProps) {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();

  const formatPrice = (kopeks: number) => `${formatAmount(kopeks / 100)} ${currencySymbol}`;

  const missing = Math.max(0, totalKopeks - balanceKopeks);
  const isFree = !isLoading && totalKopeks === 0;
  const hasEnough = balanceKopeks >= totalKopeks;
  const isZeroBalance = balanceKopeks === 0;
  const hasStrike =
    originalTotalKopeks !== undefined && originalTotalKopeks > totalKopeks;

  // ── Left column (total / «не хватает» / «доплата» / «бесплатно») ──
  const renderLeft = () => {
    if (isLoading) {
      return (
        <div className="space-y-1.5">
          <div className="h-3 w-12 animate-pulse rounded bg-champagne-300/60 dark:bg-dark-700" />
          <div className="h-5 w-20 animate-pulse rounded bg-champagne-300/60 dark:bg-dark-700" />
        </div>
      );
    }

    if (isFree) {
      return (
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-champagne-600 dark:text-dark-400">
            {t('subscription.total', 'К оплате')}
          </div>
          <div className="font-display text-xl font-bold text-champagne-900 dark:text-dark-50">
            {t('subscription.free', 'Бесплатно')}
          </div>
        </div>
      );
    }

    // Switch/upgrade: the real surcharge is computed by the switch
    // preview sheet, not known here — show a neutral prompt, not a
    // misleading full-period total.
    if (isSwitch) {
      return (
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-champagne-600 dark:text-dark-400">
            {t('subscription.pay.surcharge', 'Доплата')}
          </div>
          <div className="font-display text-base font-semibold text-champagne-700 dark:text-dark-300">
            {t('subscription.pay.surchargeAtSwitch', 'рассчитаем при переходе')}
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-champagne-600 dark:text-dark-400">
          {t('subscription.total', 'К оплате')}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xl font-bold text-champagne-900 dark:text-dark-50">
            {formatPrice(totalKopeks)}
          </span>
          {hasStrike && (
            <span className="text-xs text-champagne-500 line-through dark:text-dark-500">
              {formatPrice(originalTotalKopeks!)}
            </span>
          )}
        </div>
        {/* «Не хватает Δ ₽» — the ONLY red structural element (status-hue lockout). */}
        {!isSwitch && !hasEnough && !isZeroBalance && missing > 0 && (
          <div className="mt-0.5 text-[12px] font-medium text-error-500">
            {t('subscription.pay.missing', 'Не хватает')} {formatPrice(missing)}
          </div>
        )}
      </div>
    );
  };

  // ── Button (always accent-orange primary; label/action varies) ──
  const renderButton = () => {
    if (cannotPurchase) {
      return (
        <PillButton variant="primary" disabled>
          {t('subscription.pay.unavailable', 'Недоступно')}
        </PillButton>
      );
    }

    if (isLoading) {
      return (
        <PillButton variant="primary" disabled>
          …
        </PillButton>
      );
    }

    if (isPaying) {
      return (
        <PillButton variant="primary" loading disabled>
          {t('subscription.pay.paying', 'Оплата…')}
        </PillButton>
      );
    }

    if (isSwitch) {
      return (
        <PillButton variant="primary" onClick={onSwitch} trailingIcon={<ArrowRightIcon className="h-4 w-4" />}>
          {t('subscription.pay.switch', 'Перейти на тариф')}
        </PillButton>
      );
    }

    if (isFree) {
      return (
        <PillButton variant="primary" onClick={onPay} trailingIcon={<ArrowRightIcon className="h-4 w-4" />}>
          {t('subscription.pay.connect', 'Подключить')}
        </PillButton>
      );
    }

    if (hasEnough) {
      return (
        <PillButton variant="primary" onClick={onPay} trailingIcon={<ArrowRightIcon className="h-4 w-4" />}>
          {t('subscription.pay.payFromBalance', {
            amount: formatPrice(totalKopeks),
            defaultValue: 'Оплатить {{amount}} с баланса',
          })}
        </PillButton>
      );
    }

    // Not enough. Zero balance hides the explicit Δ (it's obvious).
    if (isZeroBalance) {
      return (
        <PillButton variant="primary" onClick={onTopUpAndPay}>
          {t('subscription.pay.topUpAndPay', 'Пополнить и оплатить')}
        </PillButton>
      );
    }

    return (
      <PillButton variant="primary" onClick={onTopUpAndPay}>
        {t('subscription.pay.topUpDeltaAndPay', {
          amount: formatPrice(missing),
          defaultValue: 'Пополнить {{amount}} и оплатить',
        })}
      </PillButton>
    );
  };

  const inner = (
    <>
      {/* Reason / error above the action row. */}
      {cannotPurchase && cannotPurchaseReason && (
        <div className="mb-2 rounded-lg bg-error-500/10 px-3 py-2 text-center text-[13px] text-error-500">
          {cannotPurchaseReason}
        </div>
      )}
      {!cannotPurchase && errorMessage && (
        <div className="mb-2 text-center text-[13px] text-error-500">{errorMessage}</div>
      )}

      <div
        className={cn(
          variant === 'rail'
            ? 'flex flex-col gap-3'
            : 'flex items-center gap-4',
        )}
      >
        <div className={cn(variant === 'rail' ? '' : 'shrink-0')}>{renderLeft()}</div>
        <div className={cn(variant === 'rail' ? '' : 'min-w-0 flex-1')}>{renderButton()}</div>
      </div>
    </>
  );

  if (variant === 'rail') {
    return (
      <div
        className={cn(
          'rounded-3xl border border-champagne-300 bg-champagne-50 p-5 shadow-sm dark:border-dark-700/50 dark:bg-dark-800/60',
          className,
        )}
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      className={cn(
        // Mobile: fixed full-width bar above the (hidden) tab bar.
        'fixed inset-x-0 bottom-0 z-50 border-t border-champagne-300 bg-champagne-50/95 px-4 pt-3 backdrop-blur-md dark:border-dark-700/40 dark:bg-dark-950/95',
        // Desktop: an in-flow card inside the content column (no full-width band).
        'lg:static lg:z-auto lg:mt-4 lg:rounded-3xl lg:border lg:p-5 lg:pt-5 lg:shadow-sm lg:backdrop-blur-none dark:lg:bg-dark-800/60',
        className,
      )}
      style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">{inner}</div>
    </div>
  );
}

export default PurchasePayBar;
