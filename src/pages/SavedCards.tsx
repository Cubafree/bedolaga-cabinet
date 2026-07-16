import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { balanceApi } from '../api/balance';
import { useToast } from '../components/Toast';
import { useDestructiveConfirm } from '../platform/hooks/useNativeDialog';

import { Kicker } from '@/components/ui/Kicker';
import { WebBackButton } from '../components/WebBackButton';
import { CreditCardIcon, TrashIcon } from '@/components/icons';

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
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-20 w-full rounded-bento" />
          ))}
        </div>
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
    </div>
  );
}
