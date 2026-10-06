import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Twemoji from '@/lib/twemoji';
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
import { CheckIcon } from '../../icons';
import { PeriodSelector, type PeriodChoice } from './PeriodSelector';
import { PurchasePayBar } from './PurchasePayBar';
import { cn } from '@/lib/utils';
import type {
  ClassicPurchaseOptions,
  PeriodOption,
  PurchaseSelection,
  Subscription,
} from '../../../types';

// ──────────────────────────────────────────────────────────────────
// ClassicPurchasePanel  (NOTES_purchase_redesign §6 — flatten)
//
// Retires the ClassicPurchaseWizard step machine (currentStep / steps /
// goToNextStep). The period step becomes the inline <PeriodSelector>;
// traffic / servers / devices collapse into conditional disclosures
// rendered ONLY when the chosen period offers a real choice; confirm
// becomes the live preview total + the sticky <PurchasePayBar>.
//
// Keeps previewPurchase / submitPurchase / seed-defaults logic intact.
// Wires the same top-up-and-resume loop as the tariffs panel.
// ──────────────────────────────────────────────────────────────────

interface ClassicPurchasePanelProps {
  classicOptions: ClassicPurchaseOptions;
  subscription: Subscription | null;
  subscriptionId: number | undefined;
  balanceKopeks: number;
  isResume: boolean;
  topUpHref: string;
}

export function ClassicPurchasePanel({
  classicOptions,
  subscription,
  subscriptionId,
  balanceKopeks,
  isResume,
  topUpHref,
}: ClassicPurchasePanelProps) {
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

  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption | null>(null);
  const [selectedTraffic, setSelectedTraffic] = useState<number | null>(null);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<number>(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const getAvailableServers = useCallback(
    (period: PeriodOption | null) => {
      if (!period?.servers.options) return [];
      return period.servers.options.filter((server) => {
        if (!server.is_available) return false;
        if (subscription?.is_trial && server.name.toLowerCase().includes('trial')) return false;
        return true;
      });
    },
    [subscription?.is_trial],
  );

  // Seed defaults from classicOptions.selection on first mount.
  useEffect(() => {
    if (selectedPeriod) return;
    const defaultPeriod =
      classicOptions.periods.find((p) => p.id === classicOptions.selection.period_id) ||
      classicOptions.periods[0];
    setSelectedPeriod(defaultPeriod);
    setSelectedTraffic(classicOptions.selection.traffic_value);
    const avail = getAvailableServers(defaultPeriod);
    const availUuids = new Set(avail.map((s) => s.uuid));
    if (avail.length === 1) setSelectedServers([avail[0].uuid]);
    else setSelectedServers(classicOptions.selection.servers.filter((u) => availUuids.has(u)));
    setSelectedDevices(classicOptions.selection.devices);
  }, [classicOptions, selectedPeriod, getAvailableServers]);

  const applyPeriodDefaults = (period: PeriodOption) => {
    setSelectedPeriod(period);
    if (period.traffic.current !== undefined) setSelectedTraffic(period.traffic.current);
    const avail = getAvailableServers(period);
    if (avail.length === 1) {
      setSelectedServers([avail[0].uuid]);
    } else if (period.servers.selected) {
      const availUuids = new Set(avail.map((s) => s.uuid));
      setSelectedServers(period.servers.selected.filter((u) => availUuids.has(u)));
    }
    if (period.devices.current) setSelectedDevices(period.devices.current);
  };

  // ── Period choices (data-driven) ────────────────────────────────
  const periodChoices: PeriodChoice[] = useMemo(
    () =>
      classicOptions.periods.map((p) => {
        const promo = applyPromoDiscount(p.price_kopeks, p.original_price_kopeks);
        const perMonth =
          promo.price !== p.price_kopeks
            ? Math.round(promo.price / Math.max(1, p.period_days / 30))
            : p.per_month_price_kopeks;
        return {
          days: p.period_days,
          label: p.label,
          priceKopeks: promo.price,
          originalKopeks: promo.original ?? undefined,
          discountPercent: promo.percent ?? undefined,
          perMonthKopeks: perMonth,
          isPromoGroup: promo.isPromoGroup,
        };
      }),
    [classicOptions.periods, applyPromoDiscount],
  );

  const currentSelection: PurchaseSelection = useMemo(
    () => ({
      period_id: selectedPeriod?.id,
      period_days: selectedPeriod?.period_days,
      traffic_value: selectedTraffic ?? undefined,
      servers: selectedServers,
      devices: selectedDevices,
    }),
    [selectedPeriod, selectedTraffic, selectedServers, selectedDevices],
  );

  // Live preview — always enabled once a period is picked (no longer
  // gated to a confirm step). Debounced by react-query's key dedupe.
  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ['purchase-preview', currentSelection],
    queryFn: () => subscriptionApi.previewPurchase(currentSelection, subscriptionId),
    enabled: !!selectedPeriod,
  });

  const purchaseMutation = useMutation({
    mutationFn: () => subscriptionApi.submitPurchase(currentSelection, subscriptionId),
    onSuccess: () => {
      clearPurchaseCart();
      queryClient.invalidateQueries({ queryKey: ['subscription', subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['purchase-options', subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      navigate('/subscriptions', { replace: true });
    },
  });

  useCloseOnSuccessNotification(() => clearPurchaseCart());

  // ── Resume: restore saved order after top-up return ─────────────
  useEffect(() => {
    if (!isResume) return;
    const cart = loadPurchaseCart();
    if (!cart || cart.mode !== 'classic' || !cart.selection) return;
    const sel = cart.selection;
    const period =
      classicOptions.periods.find((p) => p.id === sel.period_id) ||
      classicOptions.periods.find((p) => p.period_days === sel.period_days);
    if (period) {
      setSelectedPeriod(period);
      if (sel.traffic_value !== undefined) setSelectedTraffic(sel.traffic_value);
      if (sel.servers) setSelectedServers(sel.servers);
      if (sel.devices) setSelectedDevices(sel.devices);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResume]);

  const toggleServer = (uuid: string) => {
    if (selectedServers.includes(uuid)) {
      if (selectedServers.length > 1) setSelectedServers(selectedServers.filter((s) => s !== uuid));
    } else {
      setSelectedServers([...selectedServers, uuid]);
    }
  };

  // ── Disclosure availability (only when there's a real choice) ───
  const trafficSelectable =
    !!selectedPeriod?.traffic.selectable && (selectedPeriod.traffic.options?.length ?? 0) > 0;
  const availableServers = getAvailableServers(selectedPeriod);
  const serversSelectable = availableServers.length > 1;
  const devicesSelectable =
    !!selectedPeriod && selectedPeriod.devices.max > selectedPeriod.devices.min;
  const hasAdvanced = trafficSelectable || serversSelectable || devicesSelectable;

  // ── Totals from preview ─────────────────────────────────────────
  const promoTotal = preview
    ? applyPromoDiscount(preview.total_price_kopeks, preview.original_price_kopeks)
    : null;
  const totalKopeks = promoTotal?.price ?? 0;
  const originalTotalKopeks =
    promoTotal?.original && promoTotal.original > promoTotal.price
      ? promoTotal.original
      : undefined;

  const cannotPurchase = !!preview && !preview.can_purchase && preview.missing_amount_kopeks <= 0;

  // ── Pay-bar actions ─────────────────────────────────────────────
  const handlePay = () => {
    impact('medium');
    purchaseMutation.mutate();
  };

  const handleTopUpAndPay = () => {
    impact('medium');
    savePurchaseCart({
      mode: 'classic',
      selection: currentSelection,
      subscriptionId,
      totalKopeks,
    });
    const missing = preview?.missing_amount_kopeks ?? Math.max(0, totalKopeks - balanceKopeks);
    const amount = Math.ceil((missing > 0 ? missing : totalKopeks) / 100);
    navigate(`${topUpHref}&amount=${amount}`);
  };

  return (
    <div className="space-y-5">
      {/* Period selector — data-driven. */}
      {periodChoices.length > 0 && (
        <div>
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-champagne-600 dark:text-dark-400">
            {t('subscription.periodLabel', 'Период')}
          </div>
          <PeriodSelector
            periods={periodChoices}
            value={selectedPeriod?.period_days ?? null}
            onChange={(c) => {
              const period = classicOptions.periods.find((p) => p.period_days === c.days);
              if (period) applyPeriodDefaults(period);
            }}
          />
        </div>
      )}

      {/* «Настроить» disclosure — traffic / servers / devices, only when offered. */}
      {hasAdvanced && (
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
            <div className="mt-3 space-y-5 rounded-2xl border border-champagne-300 bg-champagne-50 p-4 dark:border-dark-700/50 dark:bg-dark-800/50">
              {/* Traffic */}
              {trafficSelectable && selectedPeriod?.traffic.options && (
                <div>
                  <div className="mb-2 text-sm font-medium text-champagne-900 dark:text-dark-100">
                    {t('subscription.stepTraffic', 'Трафик')}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {selectedPeriod.traffic.options.map((option) => {
                      const p = applyPromoDiscount(
                        option.price_kopeks,
                        option.original_price_kopeks,
                      );
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSelectedTraffic(option.value)}
                          disabled={!option.is_available}
                          className={cn(
                            'rounded-2xl border p-3 text-center transition-all',
                            selectedTraffic === option.value
                              ? 'border-accent-500 bg-accent-500/10'
                              : 'border-champagne-300 bg-champagne-50 hover:border-champagne-400 dark:border-dark-700/50 dark:bg-dark-800/50',
                            !option.is_available && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          <div className="font-semibold text-champagne-900 dark:text-dark-100">
                            {option.label}
                          </div>
                          <div className="text-[12px] text-accent-600 dark:text-accent-400">
                            {formatPrice(p.price)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Servers */}
              {serversSelectable && (
                <div>
                  <div className="mb-2 text-sm font-medium text-champagne-900 dark:text-dark-100">
                    {t('subscription.stepServers', 'Серверы')}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {availableServers.map((server) => {
                      const p = applyPromoDiscount(
                        server.price_kopeks,
                        server.original_price_kopeks,
                      );
                      const checked = selectedServers.includes(server.uuid);
                      return (
                        <button
                          key={server.uuid}
                          type="button"
                          onClick={() => toggleServer(server.uuid)}
                          className={cn(
                            'flex items-center gap-2.5 rounded-2xl border p-3 text-left transition-all',
                            checked
                              ? 'border-accent-500 bg-accent-500/10'
                              : 'border-champagne-300 bg-champagne-50 hover:border-champagne-400 dark:border-dark-700/50 dark:bg-dark-800/50',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2',
                              checked
                                ? 'border-accent-500 bg-accent-500'
                                : 'border-champagne-400 dark:border-dark-600',
                            )}
                          >
                            {checked && <CheckIcon />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-champagne-900 dark:text-dark-100">
                              <Twemoji
                                options={{ className: 'twemoji', folder: 'svg', ext: '.svg' }}
                              >
                                {server.name}
                              </Twemoji>
                            </span>
                            <span className="text-[12px] text-accent-600 dark:text-accent-400">
                              {formatPrice(p.price)}
                              {t('subscription.perMonth', '/мес')}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Devices */}
              {devicesSelectable && selectedPeriod && (
                <div>
                  <div className="mb-2 text-sm font-medium text-champagne-900 dark:text-dark-100">
                    {t('subscription.stepDevices', 'Устройства')}
                  </div>
                  <div className="flex items-center justify-center gap-6 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedDevices(
                          Math.max(selectedPeriod.devices.min, selectedDevices - 1),
                        )
                      }
                      disabled={selectedDevices <= selectedPeriod.devices.min}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-champagne-300 text-2xl text-champagne-900 disabled:opacity-40 dark:border-dark-600 dark:text-dark-100"
                    >
                      −
                    </button>
                    <div className="text-center">
                      <div className="font-display text-4xl font-bold text-champagne-900 dark:text-dark-100">
                        {selectedDevices}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedDevices(
                          Math.min(selectedPeriod.devices.max, selectedDevices + 1),
                        )
                      }
                      disabled={selectedDevices >= selectedPeriod.devices.max}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-champagne-300 text-2xl text-champagne-900 disabled:opacity-40 dark:border-dark-600 dark:text-dark-100"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Calm summary from the preview breakdown. */}
      {preview && preview.breakdown.length > 0 && (
        <div className="space-y-1.5 rounded-2xl border border-champagne-300 bg-champagne-100/60 px-4 py-3 text-[13px] dark:border-dark-700/50 dark:bg-dark-800/40">
          {preview.breakdown.map((item, idx) => (
            <div key={idx} className="flex justify-between text-champagne-700 dark:text-dark-300">
              <span>{item.label}</span>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Sticky balance-aware pay bar. */}
      <PurchasePayBar
        totalKopeks={totalKopeks}
        originalTotalKopeks={originalTotalKopeks}
        balanceKopeks={balanceKopeks}
        isLoading={previewLoading || !preview}
        isPaying={purchaseMutation.isPending}
        cannotPurchase={cannotPurchase}
        cannotPurchaseReason={preview?.status_message ?? null}
        errorMessage={purchaseMutation.isError ? getErrorMessage(purchaseMutation.error) : null}
        onPay={handlePay}
        onTopUpAndPay={handleTopUpAndPay}
      />
    </div>
  );
}

export default ClassicPurchasePanel;
