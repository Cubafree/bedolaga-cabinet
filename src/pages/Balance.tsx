import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router';

import { useAuthStore } from '../store/auth';
import { balanceApi } from '../api/balance';
import { useCurrency } from '../hooks/useCurrency';
import { API } from '../config/constants';
import type { PaginatedResponse, Transaction } from '../types';

import { Kicker } from '@/components/ui/Kicker';
import { PillButton } from '@/components/ui/PillButton';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CreditCardIcon,
  WalletIcon,
  PlusIcon,
} from '@/components/icons';
import { isPaidStatus, isFailedStatus } from '../utils/paymentStatus';

export default function Balance() {
  const { t } = useTranslation();
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const queryClient = useQueryClient();
  const { formatAmount, currencySymbol } = useCurrency();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const paymentHandledRef = useRef(false);

  const { data: balanceData, refetch: refetchBalance } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Handle payment return from gateway → result sheet route.
  useEffect(() => {
    if (paymentHandledRef.current) return;
    const paymentStatus = searchParams.get('payment') || searchParams.get('status');
    const normalised = paymentStatus?.toLowerCase() ?? '';
    const isSuccess = isPaidStatus(normalised) || searchParams.get('success') === 'true';
    const isFailed = isFailedStatus(normalised);
    if (isSuccess) {
      paymentHandledRef.current = true;
      navigate('/balance/top-up/result?status=success', { replace: true });
    } else if (isFailed) {
      paymentHandledRef.current = true;
      navigate('/balance/top-up/result?status=failed', { replace: true });
    }
  }, [searchParams, navigate]);

  const [promocode, setPromocode] = useState('');
  const [promocodeLoading, setPromocodeLoading] = useState(false);
  const [promocodeError, setPromocodeError] = useState<string | null>(null);
  const [promocodeSuccess, setPromocodeSuccess] = useState<{
    message: string;
    amount: number;
  } | null>(null);
  const [promoSelectSubs, setPromoSelectSubs] = useState<Array<{
    id: number;
    tariff_name: string;
    days_left: number;
  }> | null>(null);
  const [promoSelectCode, setPromoSelectCode] = useState<string | null>(null);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const { data: transactions, isLoading } = useQuery<PaginatedResponse<Transaction>>({
    queryKey: ['transactions', transactionsPage],
    queryFn: () => balanceApi.getTransactions({ per_page: 20, page: transactionsPage }),
    placeholderData: (previousData) => previousData,
  });

  const { data: savedCardsData } = useQuery({
    queryKey: ['saved-cards'],
    queryFn: balanceApi.getSavedCards,
    staleTime: 5 * 60 * 1000,
  });

  const normalizeType = (type: string) => type?.toUpperCase?.() ?? type;

  const getTypeLabel = (type: string) => {
    switch (normalizeType(type)) {
      case 'DEPOSIT':
        return t('balance.details.history.topup');
      case 'SUBSCRIPTION_PAYMENT':
        return t('balance.details.history.payment');
      case 'REFERRAL_REWARD':
        return t('balance.details.history.referral');
      case 'GIFT':
        return t('balance.details.history.gift');
      case 'REFUND':
        return t('balance.details.history.refund');
      case 'WITHDRAWAL':
        return t('balance.withdrawal');
      default:
        return type;
    }
  };

  const handlePromocodeActivate = async (subscriptionId?: number) => {
    const code = subscriptionId ? promoSelectCode || '' : promocode.trim();
    if (!code) return;

    setPromocodeLoading(true);
    setPromocodeError(null);
    setPromocodeSuccess(null);

    try {
      const result = await balanceApi.activatePromocode(code, subscriptionId);

      if (result.error === 'select_subscription' && result.eligible_subscriptions) {
        setPromoSelectSubs(result.eligible_subscriptions);
        setPromoSelectCode(result.code || code);
        return;
      }

      if (result.success) {
        const bonusAmount = (result.balance_after || 0) - (result.balance_before || 0);
        setPromocodeSuccess({
          message: result.bonus_description || t('balance.promocode.success'),
          amount: bonusAmount,
        });
        setTransactionsPage(1);
        setPromocode('');
        setPromoSelectSubs(null);
        setPromoSelectCode(null);
        await refetchBalance();
        await refreshUser();
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['purchase-options'] });
        queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      const errorDetail = axiosError.response?.data?.detail || 'server_error';
      const detail = errorDetail.toLowerCase();
      const errorKey = detail.includes('not found')
        ? 'not_found'
        : detail.includes('deactivated')
          ? 'inactive'
          : detail.includes('not yet active')
            ? 'not_yet_valid'
            : detail.includes('expired')
              ? 'expired'
              : detail.includes('fully used')
                ? 'used'
                : detail.includes('already used')
                  ? 'already_used_by_user'
                  : 'server_error';
      setPromocodeError(t(`balance.promocode.errors.${errorKey}`));
      setPromoSelectSubs(null);
      setPromoSelectCode(null);
    } finally {
      setPromocodeLoading(false);
    }
  };

  const hasBalance = (balanceData?.balance_rubles || 0) > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Kicker className="mb-1">{t('balance.title')}</Kicker>
        <h1 className="font-display text-2xl font-bold text-champagne-900 dark:text-dark-50">
          {t('balance.title')}
        </h1>
      </div>

      {/* Balance — big, clear, the number carries the weight */}
      <div className="rounded-4xl border border-champagne-300 bg-champagne-50 p-7 shadow-sm dark:border-dark-700/40 dark:bg-dark-900/60">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-champagne-500 dark:text-dark-400">
          {hasBalance ? t('balance.details.currentLabel') : t('balance.details.emptyLabel')}
        </div>
        <div className="font-display text-[44px] font-extrabold leading-none text-champagne-900 dark:text-dark-50 sm:text-[52px]">
          {formatAmount(balanceData?.balance_rubles || 0)}
          <span className="ml-2 align-top text-2xl font-bold text-champagne-400">
            {currencySymbol}
          </span>
        </div>
        <p className="mt-3 text-[13px] text-champagne-600 dark:text-dark-400">
          {t('balance.details.hint')}
        </p>
        <div className="mt-5">
          <PillButton
            variant="primary"
            leadingIcon={<PlusIcon className="h-5 w-5" />}
            onClick={() => navigate('/balance/top-up')}
          >
            {t('balance.details.topup')}
          </PillButton>
        </div>
      </div>

      {/* Promo code */}
      <section className="rounded-bento border border-champagne-300 bg-champagne-50 p-6 dark:border-dark-700/40 dark:bg-dark-900/60">
        <h2 className="mb-4 font-display text-base font-bold text-champagne-900 dark:text-dark-50">
          {t('balance.promocode.title')}
        </h2>
        <div className="flex gap-2.5">
          <input
            type="text"
            value={promocode}
            onChange={(e) => setPromocode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePromocodeActivate()}
            placeholder={t('balance.promocode.placeholder')}
            disabled={promocodeLoading}
            className="h-12 flex-1 rounded-full border border-champagne-300 bg-champagne-100 px-5 text-[15px] text-champagne-900 outline-none placeholder:text-champagne-400 focus:ring-2 focus:ring-accent-500/40 dark:border-dark-700 dark:bg-dark-800/60 dark:text-dark-50"
          />
          <PillButton
            variant="dark"
            fullWidth={false}
            loading={promocodeLoading}
            disabled={!promocode.trim()}
            onClick={() => handlePromocodeActivate()}
          >
            {t('balance.promocode.activate')}
          </PillButton>
        </div>

        {promocodeError && (
          <div className="mt-3 rounded-xl border border-error-500/30 bg-error-500/10 p-3 text-sm text-error-500">
            {promocodeError}
          </div>
        )}
        {promocodeSuccess && (
          <div className="mt-3 rounded-xl border border-success-500/30 bg-success-500/10 p-3 text-sm text-success-600">
            <div className="font-medium">{promocodeSuccess.message}</div>
            {promocodeSuccess.amount > 0 && (
              <div className="mt-1">
                {t('balance.promocode.balanceAdded', {
                  amount: promocodeSuccess.amount.toFixed(2),
                })}
              </div>
            )}
          </div>
        )}
        {promoSelectSubs && promoSelectSubs.length > 0 && (
          <div className="mt-3 space-y-2 rounded-xl border border-accent-500/30 bg-accent-500/8 p-3">
            <div className="text-sm font-medium text-champagne-800 dark:text-dark-200">
              {t('balance.promocode.selectSubscription')}
            </div>
            {promoSelectSubs.map((sub) => (
              <button
                key={sub.id}
                onClick={() => handlePromocodeActivate(sub.id)}
                disabled={promocodeLoading}
                className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-champagne-300 bg-champagne-100 px-3 py-2 text-sm text-champagne-800 transition-colors hover:border-accent-500/50 dark:border-dark-700 dark:bg-dark-800/60 dark:text-dark-200"
              >
                <span className="truncate">{sub.tariff_name}</span>
                <span className="shrink-0 text-champagne-500">
                  {t('balance.promocode.daysLeft', { count: sub.days_left })}
                </span>
              </button>
            ))}
            <button
              onClick={() => {
                setPromoSelectSubs(null);
                setPromoSelectCode(null);
              }}
              className="text-xs text-champagne-500 hover:text-champagne-800"
            >
              {t('common.cancel')}
            </button>
          </div>
        )}
      </section>

      {/* Transaction history (collapsible) */}
      <section className="overflow-hidden rounded-bento border border-champagne-300 bg-champagne-50 dark:border-dark-700/40 dark:bg-dark-900/60">
        <button
          onClick={() => setIsHistoryOpen(!isHistoryOpen)}
          className="flex w-full items-center justify-between p-6 text-left"
        >
          <h2 className="font-display text-base font-bold text-champagne-900 dark:text-dark-50">
            {t('balance.details.historyTitle')}
          </h2>
          <ChevronDownIcon
            className={`h-5 w-5 text-champagne-400 transition-transform duration-200 ${isHistoryOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isHistoryOpen && (
          <div className="px-6 pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
              </div>
            ) : transactions?.items && transactions.items.length > 0 ? (
              <div className="space-y-2.5">
                {transactions.items.map((tx) => {
                  const isZero = tx.amount_rubles === 0;
                  const isPositive = tx.amount_rubles > 0;
                  const displayAmount = Math.abs(tx.amount_rubles);
                  const sign = isZero ? '' : isPositive ? '+' : '-';
                  const colorClass = isZero
                    ? 'text-champagne-400'
                    : isPositive
                      ? 'text-success-600'
                      : 'text-error-500';
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-3 rounded-[14px] border border-champagne-300 bg-champagne-100 p-4 dark:border-dark-700/40 dark:bg-dark-800/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-medium text-champagne-900 dark:text-dark-50">
                          {getTypeLabel(tx.type)}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-champagne-500 dark:text-dark-400">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </div>
                        {tx.description && (
                          <div className="mt-0.5 truncate text-[12px] text-champagne-600 dark:text-dark-400">
                            {tx.description}
                          </div>
                        )}
                      </div>
                      <div className={`text-base font-bold ${colorClass}`}>
                        {sign}
                        {formatAmount(displayAmount)} {currencySymbol}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-champagne-100 dark:bg-dark-800">
                  <WalletIcon className="h-7 w-7 text-champagne-400" />
                </div>
                <div className="font-medium text-champagne-700 dark:text-dark-200">
                  {t('balance.details.historyEmpty')}
                </div>
                <div className="mt-1 text-[13px] text-champagne-500 dark:text-dark-400">
                  {t('balance.details.historyEmptyText')}
                </div>
              </div>
            )}

            {transactions && transactions.pages > 1 && (
              <div className="mt-4 flex items-center gap-3 text-sm text-champagne-500">
                <PillButton
                  variant="soft"
                  onClick={() => setTransactionsPage((prev) => Math.max(1, prev - 1))}
                  disabled={transactions.page <= 1}
                >
                  {t('common.back')}
                </PillButton>
                <div className="shrink-0 text-center">
                  {t('balance.page', { current: transactions.page, total: transactions.pages })}
                </div>
                <PillButton
                  variant="soft"
                  onClick={() =>
                    setTransactionsPage((prev) =>
                      transactions.pages ? Math.min(transactions.pages, prev + 1) : prev + 1,
                    )
                  }
                  disabled={transactions.page >= transactions.pages}
                >
                  {t('common.next')}
                </PillButton>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Saved cards (low-prominence link) */}
      {savedCardsData?.recurrent_enabled && (
        <button
          onClick={() => navigate('/balance/saved-cards')}
          className="flex w-full items-center justify-between rounded-bento border border-champagne-300 bg-champagne-50 p-5 text-left transition-colors hover:bg-champagne-100 dark:border-dark-700/40 dark:bg-dark-900/60 dark:hover:bg-dark-800/40"
        >
          <div className="flex items-center gap-3">
            <CreditCardIcon className="h-5 w-5 text-champagne-500" />
            <span className="font-medium text-champagne-900 dark:text-dark-50">
              {t('balance.details.cardsTitle')}
            </span>
          </div>
          <ChevronRightIcon className="h-5 w-5 text-champagne-400" />
        </button>
      )}
    </div>
  );
}
