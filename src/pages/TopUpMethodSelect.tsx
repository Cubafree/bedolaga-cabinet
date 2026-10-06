import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';

import { balanceApi } from '../api/balance';
import { useCurrency } from '../hooks/useCurrency';
import {
  classifyPaymentMethod,
  humanPaymentMethodLabel,
  humanPaymentMethodHint,
} from '../utils/paymentMethodLabel';
import { Kicker } from '@/components/ui/Kicker';
import { WebBackButton } from '../components/WebBackButton';
import { CardIcon, CryptoIcon, StarIcon, ChevronRightIcon, WalletIcon } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';

/** Type-level glyph (never a brand mark). */
function MethodGlyph({ kind, className }: { kind: string | null; className?: string }) {
  if (kind === 'stars') return <StarIcon className={className} />;
  if (kind === 'crypto') return <CryptoIcon className={className} />;
  if (kind === 'sbp') return <WalletIcon className={className} />;
  return <CardIcon className={className} />;
}

export default function TopUpMethodSelect() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatAmount, currencySymbol } = useCurrency();

  const { data: paymentMethods, isLoading } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: balanceApi.getPaymentMethods,
  });

  const handleMethodClick = (methodId: string) => {
    const params = new URLSearchParams();
    const amount = searchParams.get('amount');
    const returnTo = searchParams.get('returnTo');
    if (amount) params.set('amount', amount);
    if (returnTo) params.set('returnTo', returnTo);
    const qs = params.toString();
    navigate(`/balance/top-up/${methodId}${qs ? `?${qs}` : ''}`);
  };

  return (
    <div className="space-y-6">
      <div>
        {!searchParams.get('returnTo') && <WebBackButton to="/balance" />}
        <Kicker className="mb-1 mt-2">{t('balance.details.topupTitle')}</Kicker>
        <h1 className="font-display text-2xl font-bold text-champagne-900 dark:text-dark-50">
          {t('balance.details.methodTitle')}
        </h1>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="card" className="h-20 w-full rounded-bento" />
          ))}
        </div>
      ) : !paymentMethods || paymentMethods.length === 0 ? (
        <div className="rounded-bento border border-champagne-300 bg-champagne-50 p-8 text-center text-sm text-champagne-500 dark:border-dark-700/40 dark:bg-dark-900/60">
          {t('balance.noPaymentMethods')}
        </div>
      ) : (
        <div className="space-y-3">
          {paymentMethods.map((method) => {
            const kind = classifyPaymentMethod(method);
            const label = humanPaymentMethodLabel(method);
            const hint = humanPaymentMethodHint(method);
            return (
              <button
                key={method.id}
                type="button"
                disabled={!method.is_available}
                onClick={() => method.is_available && handleMethodClick(method.id)}
                className="flex w-full items-center gap-4 rounded-bento border border-champagne-300 bg-champagne-50 p-5 text-left transition-colors hover:bg-champagne-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-700/40 dark:bg-dark-900/60 dark:hover:bg-dark-800/40"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-500/12 text-accent-600">
                  <MethodGlyph kind={kind} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-champagne-900 dark:text-dark-50">
                    {label}
                  </div>
                  {hint && (
                    <div className="mt-0.5 text-[12px] text-champagne-600 dark:text-dark-400">
                      {hint}
                    </div>
                  )}
                  <div className="mt-1 font-mono text-[11px] text-champagne-500 dark:text-dark-400">
                    {formatAmount(method.min_amount_kopeks / 100, 0)} –{' '}
                    {formatAmount(method.max_amount_kopeks / 100, 0)} {currencySymbol}
                  </div>
                </div>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-champagne-400" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
