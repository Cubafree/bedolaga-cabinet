import { uiLocale } from '@/utils/uiLocale';
import { useState } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { balanceApi } from '../api/balance';
import { subscriptionApi } from '../api/subscription';
import { useToast } from '../components/Toast';
import { useDestructiveConfirm } from '../platform/hooks/useNativeDialog';
import type { SbpRecurringInfo, SubscriptionListItem } from '../types';

import { Kicker } from '@/components/ui/Kicker';
import { WebBackButton } from '../components/WebBackButton';
import { CreditCardIcon, TrashIcon } from '@/components/icons';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';

/** Human-readable locale key for an SBP binding status (mirrors Subscription.tsx). */
function sbpStatusLabelKey(status: string): string | null {
  switch (status) {
    case 'PENDING':
      return 'subscription.sbpRecurring.statusPending';
    case 'ACTIVE':
      return 'subscription.sbpRecurring.statusActive';
    case 'PAST_DUE':
      return 'subscription.sbpRecurring.statusPastDue';
    default:
      return null;
  }
}

interface SbpBinding {
  sub: SubscriptionListItem;
  info: SbpRecurringInfo;
}

export default function SavedCards() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirmDelete = useDestructiveConfirm();

  const {
    data: savedCardsData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['saved-cards'],
    queryFn: balanceApi.getSavedCards,
  });
  const savedCards = savedCardsData?.cards;

  const [deletingCardId, setDeletingCardId] = useState<number | null>(null);

  const handleDeleteCard = async (cardId: number) => {
    if (deletingCardId !== null) return;
    const confirmed = await confirmDelete(
      t('balance.details.cardRemoveConfirmText'),
      t('balance.details.cardRemove'),
      t('balance.details.cardRemoveConfirmTitle'),
    );
    if (!confirmed) return;
    setDeletingCardId(cardId);
    try {
      await balanceApi.deleteSavedCard(cardId);
      await queryClient.invalidateQueries({ queryKey: ['saved-cards'] });
      showToast({
        type: 'success',
        title: t('balance.savedCards.unlinkSuccess'),
        message: '',
        duration: 3000,
      });
    } catch (error) {
      console.error('Failed to unlink card:', error);
      showToast({
        type: 'error',
        title: t('balance.savedCards.unlinkError'),
        message: '',
        duration: 3000,
      });
    } finally {
      setDeletingCardId(null);
    }
  };

  // ── SBP recurring bindings (upstream feature, restyled) ──────────────
  // Same query keys as the Subscription page (['sbp-recurring', subId]) so the
  // caches are shared. The first subscription acts as a probe: a disabled
  // feature answers 403, and we don't want one failing request per subscription.
  const { data: subscriptionsData } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: subscriptionApi.getSubscriptions,
  });
  const nonTrialSubs = (subscriptionsData?.subscriptions ?? []).filter((sub) => !sub.is_trial);
  const probeSub = nonTrialSubs[0];
  const probeQuery = useQuery({
    queryKey: ['sbp-recurring', probeSub?.id],
    queryFn: () => subscriptionApi.getSbpRecurring(probeSub.id),
    enabled: !!probeSub,
    retry: false,
  });
  const restQueries = useQueries({
    queries: nonTrialSubs.slice(1).map((sub) => ({
      queryKey: ['sbp-recurring', sub.id],
      queryFn: () => subscriptionApi.getSbpRecurring(sub.id),
      enabled: probeQuery.isSuccess,
      retry: false,
    })),
  });
  const sbpQueries = [probeQuery, ...restQueries];
  const sbpBindings: SbpBinding[] = nonTrialSubs.reduce<SbpBinding[]>((acc, sub, index) => {
    const info = sbpQueries[index]?.data;
    if (info && info.status !== 'none') acc.push({ sub, info });
    return acc;
  }, []);

  const [unlinkingSubId, setUnlinkingSubId] = useState<number | null>(null);
  const confirmUnlinkSbp = useDestructiveConfirm();

  const handleUnlinkSbp = async (subId: number) => {
    if (unlinkingSubId !== null) return;
    const confirmed = await confirmUnlinkSbp(
      t('subscription.sbpRecurring.confirmCancel'),
      t('subscription.sbpRecurring.cancel'),
    );
    if (!confirmed) return;
    setUnlinkingSubId(subId);
    try {
      await subscriptionApi.cancelSbpRecurring(subId);
      await queryClient.invalidateQueries({ queryKey: ['sbp-recurring', subId] });
      showToast({
        type: 'success',
        title: t('subscription.sbpRecurring.cancelled'),
        message: '',
        duration: 3000,
      });
    } catch (error) {
      console.error('Failed to unlink SBP binding:', error);
      showToast({ type: 'error', title: t('common.error'), message: '', duration: 3000 });
    } finally {
      setUnlinkingSubId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <WebBackButton to="/balance" />
        <div>
          <Kicker className="mb-1">{t('balance.title')}</Kicker>
          <h1 className="font-display text-2xl font-bold text-champagne-900 dark:text-dark-50">
            {t('balance.details.cardsTitle')}
          </h1>
        </div>
      </div>

      <p className="text-[13px] text-champagne-600 dark:text-dark-400">
        {t('balance.details.cardsSubtitle')}
      </p>

      {/* Loading */}
      {isLoading && (
        <SkeletonGroup className="space-y-3">
          <Skeleton variant="card" count={2} className="h-20 w-full rounded-bento" />
        </SkeletonGroup>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-bento border border-error-500/30 bg-error-500/10 p-6 text-center text-sm text-error-500">
          {t('balance.savedCards.loadError')}
        </div>
      )}

      {/* Cards */}
      {!isLoading && !isError && savedCards && savedCards.length > 0 && (
        <div className="space-y-3">
          {savedCards.map((card) => (
            <div
              key={card.id}
              className="flex items-center justify-between gap-3 rounded-bento border border-champagne-300 bg-champagne-50 p-5 dark:border-dark-700/40 dark:bg-dark-900/60"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-500/12 text-accent-600">
                  <CreditCardIcon className="h-5 w-5" />
                </span>
                <div className="font-medium text-champagne-900 dark:text-dark-50">
                  {card.card_last4
                    ? t('balance.details.cardItem', { last4: card.card_last4 })
                    : card.title || t('balance.savedCards.card')}
                </div>
              </div>
              <button
                onClick={() => handleDeleteCard(card.id)}
                disabled={deletingCardId === card.id}
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-error-500 transition-colors hover:bg-error-500/10 disabled:opacity-50"
              >
                {deletingCardId === card.id ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-error-500/40 border-t-error-500" />
                ) : (
                  <TrashIcon className="h-4 w-4" />
                )}
                {t('balance.details.cardRemove')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && savedCards && savedCards.length === 0 && (
        <div className="rounded-bento border border-champagne-300 bg-champagne-50 p-10 text-center dark:border-dark-700/40 dark:bg-dark-900/60">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-champagne-100 dark:bg-dark-800">
            <CreditCardIcon className="h-7 w-7 text-champagne-400" />
          </div>
          <div className="text-champagne-600 dark:text-dark-400">
            {t('balance.details.cardsEmpty')}
          </div>
        </div>
      )}

      {/* Security note */}
      {!isLoading && !isError && savedCards && savedCards.length > 0 && (
        <p className="text-center text-[12px] text-champagne-500 dark:text-dark-400">
          {t('balance.details.cardsSecurity')}
        </p>
      )}

      {/* SBP recurring bindings — shown only when at least one exists */}
      {sbpBindings.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-base font-bold text-champagne-900 dark:text-dark-50">
            {t('balance.savedCards.sbpSection')}
          </h2>
          {sbpBindings.map(({ sub, info }) => {
            const statusKey = sbpStatusLabelKey(info.status);
            return (
              <div
                key={sub.id}
                className="flex flex-col gap-3 rounded-bento border border-champagne-300 bg-champagne-50 p-5 dark:border-dark-700/40 dark:bg-dark-900/60 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium text-champagne-900 dark:text-dark-50">
                    {sub.tariff_name || `#${sub.id}`}
                  </div>
                  <div className="text-xs text-champagne-600 dark:text-dark-400">
                    {t('balance.savedCards.sbpBinding')}
                    {statusKey ? ` · ${t(statusKey)}` : ''}
                    {info.next_charge_at
                      ? ` · ${t('subscription.sbpRecurring.nextCharge', {
                          date: new Date(info.next_charge_at).toLocaleDateString(uiLocale(), {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          }),
                        })}`
                      : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleUnlinkSbp(sub.id)}
                  disabled={unlinkingSubId === sub.id}
                  className="flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-error-500 transition-colors hover:bg-error-500/10 disabled:opacity-50 sm:self-auto"
                >
                  {t('balance.savedCards.sbpUnlink')}
                </button>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
