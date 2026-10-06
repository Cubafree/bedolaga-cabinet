import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriptionApi } from '../../../api/subscription';
import { useCurrency } from '../../../hooks/useCurrency';
import { usePromoDiscount } from '../../../hooks/usePromoDiscount';
import { useHaptic } from '../../../platform';
import { useCloseOnSuccessNotification } from '../../../store/successNotification';
import { getErrorMessage } from '../../../utils/subscriptionHelpers';
import {
  savePurchaseCart,
  loadPurchaseCart,
  clearPurchaseCart,
} from '../../../utils/purchaseCartStorage';
import { SwitchTariffSheet } from '../sheets/SwitchTariffSheet';
import { PeriodSelector, type PeriodChoice } from './PeriodSelector';
import { PurchasePayBar } from './PurchasePayBar';
import { cn } from '@/lib/utils';
import type { Tariff, TariffPeriod, Subscription, PurchaseOptions } from '../../../types';

// ──────────────────────────────────────────────────────────────────
// TariffsPurchasePanel  (NOTES_purchase_redesign §2, §6)
//
// Flattens TariffPickerGrid + TariffPurchaseForm into the one screen:
//   tariff chips (only if >1 buyable) → inline <PeriodSelector> →
//   calm «what you get» summary → «Настроить» disclosure (custom
//   traffic) → sticky <PurchasePayBar>.
//
// The purchase mutation lives here (lifted from TariffPurchaseForm).
// Decision 4: when ?subscriptionId is set and the tariff is the current
// one, this is an EXTENSION/RENEWAL — we forward subscriptionId so the
// backend resolves the exact row and prices the renewal (NOT a fresh
// buy). Switching to a *different* tariff mid-sub still routes through
// SwitchTariffSheet (upgrade-cost preview).
//
// Top-up-and-resume (§4): «Пополнить Δ ₽ и оплатить» saves the order to
// sessionStorage and navigates to the existing top-up flow with
// amount=Δ + returnTo(this screen, resume=1). On return we restore the
// selection; the bar flips to «Оплатить N ₽ с баланса» and the user
// taps ONE explicit «Оплатить» (decision 1 — no silent auto-pay).
// ──────────────────────────────────────────────────────────────────

interface TariffsPurchasePanelProps {
  tariffs: Tariff[];
  subscription: Subscription | null;
  subscriptionId: number | undefined;
  balanceKopeks: number;
  isMultiTariff: boolean;
  isResume: boolean;
  purchaseOptions: PurchaseOptions;
  /** Top-up href (returnTo this screen, resume=1) built by the page shell. */
  topUpHref: string;
}

const isDailyTariff = (tariff: Tariff) =>
  Boolean(tariff.is_daily || (tariff.daily_price_kopeks && tariff.daily_price_kopeks > 0));

export function TariffsPurchasePanel({
  tariffs,
  subscription,
  subscriptionId,
  balanceKopeks,
  isMultiTariff,
  isResume,
  purchaseOptions,
  topUpHref,
}: TariffsPurchasePanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatAmount, currencySymbol } = useCurrency();
  const { applyPromoDiscount } = usePromoDiscount();
  const { impact } = useHaptic();

  const formatPrice = (kopeks: number) =>
    kopeks === 0
      ? t('subscription.free', 'Бесплатно')
      : `${formatAmount(kopeks / 100)} ${currencySymbol}`;

  // ── Buyable tariffs (mirror TariffPickerGrid filters) ───────────
  const buyableTariffs = useMemo(
    () =>
      [...tariffs]
        .filter((tariff) => {
          if (isMultiTariff && tariff.is_purchased) return false;
          if (subscription?.is_trial && tariff.name.toLowerCase().includes('trial')) return false;
          return true;
        })
        .sort((a, b) => {
          const aCur = a.is_current || a.id === subscription?.tariff_id;
          const bCur = b.is_current || b.id === subscription?.tariff_id;
          if (aCur && !bCur) return -1;
          if (!aCur && bCur) return 1;
          return 0;
        }),
    [tariffs, isMultiTariff, subscription?.is_trial, subscription?.tariff_id],
  );

  // ── Selected tariff (auto-select when there's no real choice) ───
  const [selectedTariffId, setSelectedTariffId] = useState<number | null>(
    () => buyableTariffs[0]?.id ?? null,
  );
  const selectedTariff =
    buyableTariffs.find((tr) => tr.id === selectedTariffId) ?? buyableTariffs[0] ?? null;

  // ── Period choices (data-driven from tariff.periods) ────────────
  const periodChoices: PeriodChoice[] = useMemo(() => {
    if (!selectedTariff) return [];
    return selectedTariff.periods.map((p: TariffPeriod) => {
      const promo = applyPromoDiscount(p.price_kopeks, p.original_price_kopeks);
      const perMonth =
        promo.price !== p.price_kopeks
          ? Math.round(promo.price / Math.max(1, p.days / 30))
          : p.price_per_month_kopeks;
      return {
        days: p.days,
        label: p.label,
        priceKopeks: promo.price,
        originalKopeks: promo.original ?? undefined,
        discountPercent: promo.percent ?? undefined,
        perMonthKopeks: perMonth,
        isPromoGroup: promo.isPromoGroup,
      };
    });
  }, [selectedTariff, applyPromoDiscount]);

  // Best-value pre-select: highest discount, fallback longest period.
  const bestValueDays = useMemo(() => {
    if (periodChoices.length === 0) return null;
    const withDiscount = periodChoices.filter((p) => (p.discountPercent ?? 0) > 0);
    if (withDiscount.length > 0) {
      return withDiscount.reduce((a, b) =>
        (b.discountPercent ?? 0) > (a.discountPercent ?? 0) ? b : a,
      ).days;
    }
    return [...periodChoices].sort((a, b) => b.days - a.days)[0].days;
  }, [periodChoices]);

  const [selectedDays, setSelectedDays] = useState<number | null>(null);

  // Re-seed period when tariff (or its periods) change.
  useEffect(() => {
    setSelectedDays(bestValueDays);
  }, [selectedTariff?.id, bestValueDays]);

  // ── Custom traffic add-on («Настроить» disclosure) ──────────────
  const hasCustomTraffic =
    !!selectedTariff?.custom_traffic_enabled &&
    (selectedTariff?.traffic_price_per_gb_kopeks ?? 0) > 0;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useCustomTraffic, setUseCustomTraffic] = useState(false);
  const [customTrafficGb, setCustomTrafficGb] = useState(50);

  // Reset advanced state on tariff change.
  useEffect(() => {
    setShowAdvanced(false);
    setUseCustomTraffic(false);
    setCustomTrafficGb(selectedTariff?.min_traffic_gb ?? 50);
  }, [selectedTariff?.id]);

  // ── Switch detection (different tariff on an active paid sub) ────
  const isCurrentTariff =
    !!selectedTariff &&
    (selectedTariff.is_current || selectedTariff.id === subscription?.tariff_id);
  const isSubscriptionExpired =
    purchaseOptions &&
    'subscription_is_expired' in purchaseOptions &&
    purchaseOptions.subscription_is_expired === true;
  const canSwitch =
    !isMultiTariff &&
    !!subscription &&
    !!subscription.tariff_id &&
    !isCurrentTariff &&
    !subscription.is_trial &&
    !isSubscriptionExpired &&
    (subscription.is_active || subscription.is_limited);

  const [switchTariffId, setSwitchTariffId] = useState<number | null>(null);

  // ── Totals ──────────────────────────────────────────────────────
  const daily = !!selectedTariff && isDailyTariff(selectedTariff);
  const selectedPeriod = periodChoices.find((p) => p.days === selectedDays) ?? null;
  const trafficAddKopeks =
    useCustomTraffic && hasCustomTraffic
      ? customTrafficGb * (selectedTariff?.traffic_price_per_gb_kopeks ?? 0)
      : 0;

  const totalKopeks = daily
    ? (selectedTariff?.daily_price_kopeks ?? 0)
    : (selectedPeriod?.priceKopeks ?? 0) + trafficAddKopeks;
  const originalTotalKopeks =
    !daily && selectedPeriod?.originalKopeks
      ? selectedPeriod.originalKopeks + trafficAddKopeks
      : undefined;

  // ── Purchase mutation (lifted from TariffPurchaseForm) ──────────
  const purchaseMutation = useMutation({
    mutationFn: () => {
      if (!selectedTariff) throw new Error('no tariff');
      const days = daily ? 1 : (selectedDays ?? selectedTariff.periods[0]?.days ?? 30);
      const trafficGb = useCustomTraffic && hasCustomTraffic ? customTrafficGb : undefined;
      return subscriptionApi.purchaseTariff(selectedTariff.id, days, trafficGb, subscriptionId);
    },
    onSuccess: () => {
      clearPurchaseCart();
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-options'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      navigate('/subscriptions', { replace: true });
    },
  });

  useCloseOnSuccessNotification(() => clearPurchaseCart());

  // ── Resume: restore saved order after top-up return ─────────────
  useEffect(() => {
    if (!isResume) return;
    const cart = loadPurchaseCart();
    if (!cart || cart.mode !== 'tariff' || !cart.tariffId) return;
    if (buyableTariffs.some((tr) => tr.id === cart.tariffId)) {
      setSelectedTariffId(cart.tariffId);
      if (cart.periodDays) setSelectedDays(cart.periodDays);
      if (cart.trafficGb) {
        setUseCustomTraffic(true);
        setShowAdvanced(true);
        setCustomTrafficGb(cart.trafficGb);
      }
    }
    // Decision 1: restore + leave the pay bar ready (no silent auto-pay).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResume]);

  // ── Pay-bar actions ─────────────────────────────────────────────
  // A balance-aware bar means we only ever reach the pay mutation when
  // the wallet covers the total; a surfaced error here is therefore a
  // non-balance failure. (Insufficient-funds races fall back to the
  // server message, which is acceptable for this rare case.)
  const nonBalanceError = purchaseMutation.isError ? getErrorMessage(purchaseMutation.error) : null;

  const handlePay = () => {
    impact('medium');
    purchaseMutation.mutate();
  };

  const handleTopUpAndPay = () => {
    impact('medium');
    if (!selectedTariff) return;
    const days = daily ? 1 : (selectedDays ?? selectedTariff.periods[0]?.days ?? 30);
    savePurchaseCart({
      mode: 'tariff',
      tariffId: selectedTariff.id,
      periodDays: days,
      trafficGb: useCustomTraffic && hasCustomTraffic ? customTrafficGb : undefined,
      subscriptionId,
      totalKopeks,
    });
    const missing = Math.max(0, totalKopeks - balanceKopeks);
    const amount = Math.ceil((missing > 0 ? missing : totalKopeks) / 100);
    navigate(`${topUpHref}&amount=${amount}`);
  };

  const handleSwitch = () => {
    if (selectedTariff) setSwitchTariffId(selectedTariff.id);
  };

  if (!selectedTariff) return null;

  const showTariffChips = buyableTariffs.length > 1;

  return (
    <div className="space-y-5">
      {/* Switch preview sheet (kept). */}
      <SwitchTariffSheet
        open={switchTariffId !== null}
        tariffId={switchTariffId}
        subscriptionId={subscriptionId}
        tariffs={tariffs}
        onClose={() => setSwitchTariffId(null)}
        onExpiredFallback={(tariff) => {
          setSwitchTariffId(null);
          setSelectedTariffId(tariff.id);
        }}
      />

      {/* Tariff chips — only when there's a real choice. */}
      {showTariffChips && (
        <div>
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-champagne-600 dark:text-dark-400">
            {t('subscription.tariffLabel', 'Тариф')}
          </div>
          <div className="flex snap-x gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible [&::-webkit-scrollbar]:hidden">
            {buyableTariffs.map((tariff) => {
              const selected = tariff.id === selectedTariff.id;
              const cur = tariff.is_current || tariff.id === subscription?.tariff_id;
              return (
                <button
                  key={tariff.id}
                  type="button"
                  onClick={() => {
                    impact('light');
                    setSelectedTariffId(tariff.id);
                  }}
                  aria-pressed={selected}
                  className={cn(
                    'relative min-w-[60%] shrink-0 snap-start rounded-2xl border p-3 text-left transition-all sm:min-w-0',
                    selected
                      ? 'border-accent-500 bg-accent-500/8 ring-2 ring-accent-500/30'
                      : 'border-champagne-300 bg-champagne-50 hover:border-champagne-400 dark:border-dark-700/50 dark:bg-dark-800/50',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-champagne-900 dark:text-dark-100">
                      {tariff.name}
                    </span>
                    {selected && <span className="h-2 w-2 shrink-0 rounded-full bg-accent-500" />}
                  </div>
                  <div className="mt-0.5 text-[12px] text-champagne-600 dark:text-dark-400">
                    {tariff.traffic_limit_label}
                    {' · '}
                    {tariff.device_limit === 0
                      ? '∞'
                      : t('subscription.devices', { count: tariff.device_limit })}
                  </div>
                  {cur && (
                    <span className="mt-1 inline-block rounded-full bg-success-500/15 px-2 py-0.5 text-[10px] font-semibold text-success-500">
                      {t('subscription.yourTariff', 'Ваш тариф')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Period selector — data-driven (skip for daily tariffs). */}
      {!daily && periodChoices.length > 0 && (
        <div>
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-champagne-600 dark:text-dark-400">
            {t('subscription.periodLabel', 'Период')}
          </div>
          <PeriodSelector
            periods={periodChoices}
            value={selectedDays}
            onChange={(c) => setSelectedDays(c.days)}
          />
        </div>
      )}

      {/* Daily tariff note. */}
      {daily && (
        <div className="rounded-2xl border border-accent-500/30 bg-accent-500/8 p-4 text-sm text-champagne-700 dark:text-dark-300">
          <div className="font-semibold text-champagne-900 dark:text-dark-100">
            {formatPrice(selectedTariff.daily_price_kopeks ?? 0)}
            {t('subscription.perDayShort', '/день')}
          </div>
          <div className="mt-1 text-[12px]">{t('subscription.dailyPurchase.chargedDaily')}</div>
        </div>
      )}

      {/* Calm «what you get» summary. */}
      <div className="rounded-2xl border border-champagne-300 bg-champagne-100/60 px-4 py-3 font-mono text-[12px] text-champagne-700 dark:border-dark-700/50 dark:bg-dark-800/40 dark:text-dark-300">
        {t('subscription.traffic', 'Трафик')}: {selectedTariff.traffic_limit_label}
        {'  ·  '}
        {t('subscription.devices', 'Устройства')}:{' '}
        {selectedTariff.device_limit === 0 ? '∞' : selectedTariff.device_limit}
      </div>

      {/* «Настроить» disclosure — advanced custom traffic. */}
      {hasCustomTraffic && (
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex w-full items-center justify-between rounded-2xl border border-champagne-300 bg-champagne-50 px-4 py-3 text-left text-sm text-champagne-700 dark:border-dark-700/50 dark:bg-dark-800/50 dark:text-dark-300"
          >
            <span>{t('subscription.configure', 'Настроить (срок и трафик)')}</span>
            <span className={cn('transition-transform', showAdvanced && 'rotate-90')}>›</span>
          </button>
          {showAdvanced && (
            <div className="mt-3 rounded-2xl border border-champagne-300 bg-champagne-50 p-4 dark:border-dark-700/50 dark:bg-dark-800/50">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-medium text-champagne-900 dark:text-dark-100">
                  {t('subscription.customTraffic.selectVolume', 'Выбрать объём')}
                </span>
                <button
                  type="button"
                  onClick={() => setUseCustomTraffic((v) => !v)}
                  role="switch"
                  aria-checked={useCustomTraffic}
                  className={cn(
                    'relative h-6 w-10 rounded-full transition-colors',
                    useCustomTraffic ? 'bg-accent-500' : 'bg-champagne-300 dark:bg-dark-600',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform',
                      useCustomTraffic ? 'left-5' : 'left-1',
                    )}
                  />
                </button>
              </div>
              {useCustomTraffic && (
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={selectedTariff.min_traffic_gb ?? 1}
                    max={selectedTariff.max_traffic_gb ?? 1000}
                    value={customTrafficGb}
                    onChange={(e) => setCustomTrafficGb(parseInt(e.target.value, 10))}
                    className="flex-1 accent-accent-500"
                  />
                  <span className="w-20 text-right font-mono text-sm text-champagne-900 dark:text-dark-100">
                    {customTrafficGb} {t('common.units.gb')}
                  </span>
                </div>
              )}
              {useCustomTraffic && (
                <div className="mt-2 text-right text-[12px] text-champagne-600 dark:text-dark-400">
                  +{formatPrice(trafficAddKopeks)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sticky balance-aware pay bar (the state matrix). */}
      <PurchasePayBar
        totalKopeks={totalKopeks}
        originalTotalKopeks={originalTotalKopeks}
        balanceKopeks={balanceKopeks}
        isPaying={purchaseMutation.isPending}
        errorMessage={nonBalanceError}
        isSwitch={canSwitch}
        onPay={handlePay}
        onTopUpAndPay={handleTopUpAndPay}
        onSwitch={handleSwitch}
      />
    </div>
  );
}

export default TariffsPurchasePanel;
