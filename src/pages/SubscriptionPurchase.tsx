import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { subscriptionApi } from '../api/subscription';
import { WebBackButton } from '../components/WebBackButton';
import type { ClassicPurchaseOptions } from '../types';
import { useCurrency } from '../hooks/useCurrency';
import { Kicker } from '../components/ui/Kicker';
import { TariffsPurchasePanel } from '../components/subscription/purchase/TariffsPurchasePanel';
import { ClassicPurchasePanel } from '../components/subscription/purchase/ClassicPurchasePanel';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';

// ──────────────────────────────────────────────────────────────────
// SubscriptionPurchase — the ONE consolidated «Выбор подписки» screen
// (NOTES_purchase_redesign §1–3). Page shell: keeps the queries +
// mode detection; delegates the body to two mode panels that each
// render: balance chip → tariff/period selector → calm summary →
// sticky balance-aware <PurchasePayBar>.
//
// Entry: Главная светофор CTA + «Подписка» tab →
//   /subscription/buy?subscriptionId=N  (skips the detail hop).
// The mobile tab bar is hidden on this route (App layout route-gate).
// ──────────────────────────────────────────────────────────────────

export default function SubscriptionPurchase() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { formatAmount, currencySymbol } = useCurrency();

  const subscriptionId = searchParams.get('subscriptionId')
    ? parseInt(searchParams.get('subscriptionId')!, 10)
    : undefined;
  const isResume = searchParams.get('resume') === '1';

  const { data: subscriptionResponse, isLoading } = useQuery({
    queryKey: ['subscription', subscriptionId],
    queryFn: () => subscriptionApi.getSubscription(subscriptionId),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const subscription = subscriptionResponse?.subscription ?? null;

  const {
    data: purchaseOptions,
    isLoading: optionsLoading,
    isError: optionsError,
    refetch: refetchOptions,
  } = useQuery({
    queryKey: ['purchase-options', subscriptionId],
    queryFn: () => subscriptionApi.getPurchaseOptions(subscriptionId),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const isTariffsMode = purchaseOptions?.sales_mode === 'tariffs';
  const classicOptions = !isTariffsMode ? (purchaseOptions as ClassicPurchaseOptions | null) : null;
  const tariffs =
    isTariffsMode && purchaseOptions && 'tariffs' in purchaseOptions ? purchaseOptions.tariffs : [];

  const { data: multiSubData } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 60_000,
  });
  const isMultiTariff = multiSubData?.multi_tariff_enabled ?? false;

  const balanceKopeks = purchaseOptions?.balance_kopeks ?? 0;
  const loading = isLoading || optionsLoading;

  const headerTitle =
    isMultiTariff && !subscriptionId
      ? t('subscription.newTariff', 'Новый тариф')
      : subscription && !subscription.is_trial
        ? t('subscription.extend', 'Продлить подписку')
        : t('subscription.getSubscription', 'Оформить подписку');

  // returnTo this exact screen (with subscriptionId + resume flag) so the
  // top-up flow always round-trips back into the saved order.
  const returnTo =
    '/subscription/buy' +
    (subscriptionId ? `?subscriptionId=${subscriptionId}&resume=1` : '?resume=1');
  const topUpHref = `/subscription/balance/top-up?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-40 lg:pb-6">
      <div className="flex items-center gap-3">
        <WebBackButton
          to={subscriptionId ? `/subscriptions/${subscriptionId}` : '/subscriptions'}
        />
        <div>
          <Kicker>{t('subscription.buyKicker', 'Выбор подписки')}</Kicker>
          <h1 className="font-display text-2xl font-bold text-champagne-900 dark:text-dark-50">
            {headerTitle}
          </h1>
        </div>
      </div>

      {/* Balance chip — ALWAYS on, top (the headline fix). */}
      {loading ? (
        <Skeleton className="h-12 rounded-full" />
      ) : (
        <div className="flex items-center justify-between rounded-full border border-champagne-300 bg-champagne-100 px-4 py-2.5 dark:border-dark-700/40 dark:bg-dark-800/60">
          <span className="font-mono text-[11px] uppercase tracking-wider text-champagne-600 dark:text-dark-400">
            {t('subscription.yourBalance', 'Ваш баланс')}{' '}
            <span className="font-sans font-semibold normal-case tracking-normal text-champagne-900 dark:text-dark-50">
              {formatAmount(balanceKopeks / 100)} {currencySymbol}
            </span>
          </span>
          <Link to={topUpHref} className="text-[13px] font-medium text-accent-600 hover:underline">
            {t('subscription.topUp', 'Пополнить')}
          </Link>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <SkeletonGroup className="space-y-3">
          <Skeleton className="h-5 w-16 rounded" />
          <div className="grid grid-cols-3 gap-2.5">
            <Skeleton variant="card" className="h-24 rounded-2xl" />
            <Skeleton variant="card" className="h-24 rounded-2xl" />
            <Skeleton variant="card" className="h-24 rounded-2xl" />
          </div>
        </SkeletonGroup>
      )}

      {/* Error / no options */}
      {!loading && (optionsError || !purchaseOptions) && (
        <div className="rounded-3xl border border-champagne-300 bg-champagne-50 p-6 text-center dark:border-dark-700/50 dark:bg-dark-800/60">
          <p className="mb-4 text-champagne-700 dark:text-dark-300">
            {t('subscription.loadError', 'Не удалось загрузить варианты подписки')}
          </p>
          <button
            onClick={() => refetchOptions()}
            className="rounded-xl bg-accent-500 px-6 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-600"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Tariffs mode */}
      {!loading && isTariffsMode && tariffs.length > 0 && purchaseOptions && (
        <TariffsPurchasePanel
          tariffs={tariffs}
          subscription={subscription}
          subscriptionId={subscriptionId}
          balanceKopeks={balanceKopeks}
          isMultiTariff={isMultiTariff}
          isResume={isResume}
          purchaseOptions={purchaseOptions}
          topUpHref={topUpHref}
        />
      )}

      {/* Classic mode */}
      {!loading && classicOptions && classicOptions.periods.length > 0 && (
        <ClassicPurchasePanel
          classicOptions={classicOptions}
          subscription={subscription}
          subscriptionId={subscriptionId}
          balanceKopeks={balanceKopeks}
          isResume={isResume}
          topUpHref={topUpHref}
        />
      )}

      {/* No options available fallback */}
      {!loading &&
        purchaseOptions &&
        !(isTariffsMode && tariffs.length > 0) &&
        !(classicOptions && classicOptions.periods.length > 0) && (
          <div className="rounded-3xl border border-champagne-300 bg-champagne-50 p-6 text-center dark:border-dark-700/50 dark:bg-dark-800/60">
            <p className="mb-4 text-champagne-700 dark:text-dark-300">
              {t('subscription.noOptionsAvailable', 'Нет доступных вариантов подписки')}
            </p>
            <button
              onClick={() => refetchOptions()}
              className="rounded-xl bg-accent-500 px-6 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-600"
            >
              {t('common.retry')}
            </button>
          </div>
        )}
    </div>
  );
}
