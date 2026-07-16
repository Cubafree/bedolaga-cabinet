import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { balanceApi } from '../api/balance';
import { useCurrency } from '../hooks/useCurrency';
import { checkRateLimit, getRateLimitResetTime, RATE_LIMIT_KEYS } from '../utils/rateLimit';
import { useCloseOnSuccessNotification } from '../store/successNotification';
import { useHaptic, usePlatform } from '@/platform';
import { classifyPaymentMethod, humanPaymentMethodLabel } from '../utils/paymentMethodLabel';
import type { PaymentMethod, PaymentMethodOption } from '../types';
import { Kicker } from '@/components/ui/Kicker';
import { PillButton } from '@/components/ui/PillButton';
import { WebBackButton } from '../components/WebBackButton';
import { saveTopUpPendingInfo } from '../utils/topUpStorage';
import { getSafeRedirectPath } from '../utils/safeRedirect';
import { copyToClipboard } from '@/utils/clipboard';
import { cn } from '@/lib/utils';
import {
  CardIcon,
  CheckIcon,
  CopyIcon,
  CryptoIcon,
  ExclamationIcon,
  ExternalLinkIcon,
  StarIcon,
  WalletIcon,
} from '@/components/icons';

const getMethodIcon = (kind: string | null) => {
  if (kind === 'stars') return <StarIcon />;
  if (kind === 'crypto') return <CryptoIcon />;
  if (kind === 'sbp') return <WalletIcon />;
  return <CardIcon />;
};

const getPreferredOptionId = (options?: PaymentMethod['options']) => {
  if (!options || options.length === 0) return null;

  const sbpOption = options.find((option) => {
    const normalizedId = option.id.toLowerCase();
    const normalizedName = option.name.toLowerCase();
    return (
      normalizedId.includes('sbp') ||
      normalizedName.includes('сбп') ||
      normalizedName.includes('sbp')
    );
  });

  return sbpOption?.id ?? options[0].id;
};

const sortOptionsWithSbpFirst = (options?: PaymentMethod['options']) => {
  if (!options || options.length <= 1) return options ?? [];

  const isPreferredOption = (option: PaymentMethodOption) => {
    const normalizedId = option.id.toLowerCase();
    const normalizedName = option.name.toLowerCase();
    return (
      normalizedId.includes('sbp') ||
      normalizedName.includes('сбп') ||
      normalizedName.includes('sbp')
    );
  };

  return [...options].sort((left, right) => {
    const leftIsPreferred = isPreferredOption(left);
    const rightIsPreferred = isPreferredOption(right);

    if (leftIsPreferred === rightIsPreferred) return 0;
    return leftIsPreferred ? -1 : 1;
  });
};

export default function TopUpAmount() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { methodId } = useParams<{ methodId: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { formatAmount, currencySymbol, convertAmount, convertToRub, targetCurrency } =
    useCurrency();
  const { openInvoice, openTelegramLink, openLink, platform } = usePlatform();
  const haptic = useHaptic();
  const inputRef = useRef<HTMLInputElement>(null);

  const returnTo = searchParams.get('returnTo');
  const initialAmountRubles = searchParams.get('amount')
    ? parseFloat(searchParams.get('amount')!)
    : undefined;

  // Get method from cached payment-methods query
  const cachedMethods = queryClient.getQueryData<PaymentMethod[]>(['payment-methods']);
  const method = cachedMethods?.find((m) => m.id === methodId);

  const handleNavigateBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleSuccess = useCallback(() => {
    // returnTo arrives via query string — validate as an in-app path before
    // navigate(), otherwise an absolute or encoded URL produces ugly
    // path artefacts in the URL bar. The validator returns '/' for invalid
    // input; treat that case as "no returnTo" and use the /balance default.
    const safe = getSafeRedirectPath(returnTo);
    navigate(returnTo && safe !== '/' ? safe : '/balance', { replace: true });
  }, [navigate, returnTo]);

  // Keyboard: Escape to go back
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleNavigateBack();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleNavigateBack]);

  // Auto-redirect when success notification appears (e.g., balance topped up via WebSocket)
  useCloseOnSuccessNotification(handleSuccess);

  const getInitialAmount = (): string => {
    if (!initialAmountRubles || initialAmountRubles <= 0) return '';
    const converted = convertAmount(initialAmountRubles);
    return targetCurrency === 'IRR' || targetCurrency === 'RUB'
      ? Math.ceil(converted).toString()
      : converted.toFixed(2);
  };

  const initialDisplayAmount = getInitialAmount();
  const [amount, setAmount] = useState(initialDisplayAmount);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(
    getPreferredOptionId(method?.options),
  );
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // If method not found in cache, redirect to method selection
  useEffect(() => {
    if (cachedMethods && !method) {
      const params = new URLSearchParams();
      const amount = searchParams.get('amount');
      const rt = searchParams.get('returnTo');
      if (amount) params.set('amount', amount);
      if (rt) params.set('returnTo', rt);
      const qs = params.toString();
      navigate(`/balance/top-up${qs ? `?${qs}` : ''}`, { replace: true });
    }
  }, [cachedMethods, method, navigate, searchParams]);

  useEffect(() => {
    if (!method?.options || method.options.length === 0) {
      if (selectedOption !== null) {
        setSelectedOption(null);
      }
      return;
    }

    const optionExists = method.options.some((option) => option.id === selectedOption);
    if (!optionExists) {
      setSelectedOption(getPreferredOptionId(method.options));
    }
  }, [method?.id, method?.options, selectedOption]);

  const starsPaymentMutation = useMutation({
    mutationFn: (amountKopeks: number) => balanceApi.createStarsInvoice(amountKopeks),
    onSuccess: async (data) => {
      if (!data.invoice_url) {
        setError(t('balance.errors.noPaymentLink'));
        return;
      }
      try {
        const status = await openInvoice(data.invoice_url);
        if (status === 'paid') {
          haptic.notification('success');
          setError(null);
          handleSuccess();
        } else if (status === 'failed') {
          haptic.notification('error');
          setError(t('wheel.starsPaymentFailed'));
        }
      } catch (e) {
        setError(t('balance.errors.generic', { details: String(e) }));
      }
    },
    onError: (err: unknown) => {
      haptic.notification('error');
      const axiosError = err as { response?: { data?: { detail?: string }; status?: number } };
      setError(axiosError?.response?.data?.detail || t('balance.errors.invoiceFailed'));
    },
  });

  const topUpMutation = useMutation<
    {
      payment_id: string;
      payment_url?: string;
      invoice_url?: string;
      amount_kopeks: number;
      amount_rubles: number;
      status: string;
      expires_at: string | null;
    },
    unknown,
    number
  >({
    mutationFn: (amountKopeks: number) => {
      if (!method) throw new Error('Method not loaded');
      return balanceApi.createTopUp(amountKopeks, method.id, selectedOption || undefined);
    },
    onSuccess: (data) => {
      const redirectUrl = data.payment_url || data.invoice_url;
      if (redirectUrl) {
        // Save payment info for the result page (do BEFORE possible redirect,
        // иначе после window.location.href этот код не выполнится).
        if (method && data.payment_id) {
          const displayName = humanPaymentMethodLabel(method);
          saveTopUpPendingInfo({
            amount_kopeks: data.amount_kopeks,
            method_id: method.id,
            method_name: displayName,
            payment_id: data.payment_id,
            created_at: Date.now(),
          });
        }

        // open_url_direct: seamless флоу как при покупке подарка.
        // window.location.href внутри Telegram MiniApp WebView навигирует
        // в том же контейнере без открытия внешнего браузера. После
        // оплаты return_url возвращает на /balance/top-up/result.
        //
        // t.me/ URL (Telegram Stars, CryptoBot) — всегда через нативный
        // handler (openInvoice / openTelegramLink в setPaymentUrl-ветке).
        // Stars уже отбит раньше через starsPaymentMutation, здесь — защита
        // на случай CryptoBot и других Telegram-deep-link провайдеров.
        // toLowerCase для устойчивости к редким провайдерам, которые могут вернуть
        // URL в нестандартном регистре. Также покрываем tg:// scheme на всякий случай.
        const lowerUrl = redirectUrl.toLowerCase();
        const isTelegramDeepLink =
          lowerUrl.startsWith('https://t.me/') ||
          lowerUrl.startsWith('http://t.me/') ||
          lowerUrl.startsWith('tg://');
        if (method?.open_url_direct && !isTelegramDeepLink) {
          window.location.href = redirectUrl;
          return;
        }

        setPaymentUrl(redirectUrl);
      }
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '';
      setError(
        detail.includes('not yet implemented') ? t('balance.useBot') : detail || t('common.error'),
      );
    },
  });

  // Auto-focus input (only on desktop — mobile keyboard hides bottom nav)
  useEffect(() => {
    if (platform === 'telegram') return;
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [platform]);

  if (!method) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  const hasOptions = method.options && method.options.length > 0;
  const orderedOptions = sortOptionsWithSbpFirst(method.options);
  const minRubles = method.min_amount_kopeks / 100;
  const maxRubles = method.max_amount_kopeks / 100;
  const methodKey = method.id.toLowerCase().replace(/-/g, '_');
  const methodKind = classifyPaymentMethod(method);
  const isStarsMethod = methodKind === 'stars' || methodKey.includes('stars');
  const methodName = humanPaymentMethodLabel(method);

  const handleSubmit = () => {
    setError(null);
    setPaymentUrl(null);
    inputRef.current?.blur();

    if (!checkRateLimit(RATE_LIMIT_KEYS.PAYMENT, 3, 30000)) {
      setError(
        t('balance.errors.rateLimit', { seconds: getRateLimitResetTime(RATE_LIMIT_KEYS.PAYMENT) }),
      );
      return;
    }
    if (hasOptions && !selectedOption) {
      setError(t('balance.errors.selectMethod'));
      return;
    }
    const amountCurrency = parseFloat(amount);
    if (isNaN(amountCurrency) || amountCurrency <= 0) {
      setError(t('balance.errors.enterAmount'));
      return;
    }
    const amountRubles = convertToRub(amountCurrency);
    if (amountRubles < minRubles || amountRubles > maxRubles) {
      setError(t('balance.errors.amountRange', { min: minRubles, max: maxRubles }));
      return;
    }

    // Сохраняем canonical RUB amount если юзер НЕ редактировал префилл.
    // Display-rounding в `.toFixed(2)` теряет точность: 150₽ при rate=90.66 → "1.65" USD
    // (округление вниз с 1.6545), back-конвертация даёт 1.65 × 90.66 = 149.589₽ < 150₽
    // → юзер не может купить подписку 150₽. С canonical RUB обходим FX round-trip.
    //
    // Math.ceil для не-RUB локалей покрывает остаточные sub-копеечные ошибки
    // floating-point, когда юзер реально вводит свой amount.
    const userEditedAmount = amount.trim() !== initialDisplayAmount.trim();
    let amountKopeks: number;
    if (!userEditedAmount && initialAmountRubles && initialAmountRubles > 0) {
      amountKopeks = Math.round(initialAmountRubles * 100);
    } else if (targetCurrency === 'RUB') {
      amountKopeks = Math.round(amountRubles * 100);
    } else {
      amountKopeks = Math.ceil(amountRubles * 100);
    }
    if (isStarsMethod) {
      starsPaymentMutation.mutate(amountKopeks);
    } else {
      topUpMutation.mutate(amountKopeks);
    }
  };

  const quickAmounts = [100, 300, 500, 1000].filter((a) => a >= minRubles && a <= maxRubles);
  const currencyDecimals = targetCurrency === 'IRR' || targetCurrency === 'RUB' ? 0 : 2;
  const getQuickValue = (rub: number) =>
    targetCurrency === 'IRR'
      ? Math.round(convertAmount(rub)).toString()
      : convertAmount(rub).toFixed(currencyDecimals);
  const isPending = topUpMutation.isPending || starsPaymentMutation.isPending;

  const handleOpenPayment = () => {
    if (!paymentUrl) return;
    if (paymentUrl.includes('t.me/')) {
      openTelegramLink(paymentUrl);
    } else {
      openLink(paymentUrl);
    }
  };

  const handleCopyUrl = async () => {
    if (!paymentUrl) return;
    try {
      await copyToClipboard(paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed silently
    }
  };

  const amountValid = !!amount && parseFloat(amount) > 0;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Header: type glyph + human method label */}
      <div>
        <WebBackButton to="/balance/top-up" />
        <div className="mt-2 flex items-center gap-4">
          <span
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
              isStarsMethod ? 'bg-warning-400/15 text-warning-500' : 'bg-accent-500/12 text-accent-600',
            )}
          >
            <span className="flex h-6 w-6 items-center justify-center">
              {getMethodIcon(methodKind)}
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <Kicker className="mb-0.5">{t('balance.details.topupTitle')}</Kicker>
            <h1 className="font-display text-xl font-bold text-champagne-900 dark:text-dark-50">
              {methodName}
            </h1>
          </div>
        </div>
      </div>

      {/* Payment sub-options (if the method exposes several) */}
      {hasOptions && orderedOptions.length > 0 && (
        <div className="space-y-2">
          <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-champagne-500">
            {t('balance.details.methodTitle')}
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {orderedOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedOption(opt.id)}
                className={cn(
                  'rounded-full px-4 py-3 text-sm font-semibold transition-colors',
                  selectedOption === opt.id
                    ? 'bg-accent-500/12 text-accent-600 ring-2 ring-accent-500/40'
                    : 'border border-champagne-300 bg-champagne-100 text-champagne-700 hover:bg-champagne-200 dark:border-dark-700 dark:bg-dark-800/60 dark:text-dark-200',
                )}
              >
                {opt.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Amount */}
      <div className="space-y-2">
        <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-champagne-500">
          {t('balance.details.amountTitle')}
        </label>
        <div
          className={cn(
            'relative rounded-2xl border bg-champagne-50 transition-all dark:bg-dark-900/60',
            isInputFocused
              ? 'border-accent-500 ring-2 ring-accent-500/30'
              : 'border-champagne-300 dark:border-dark-700/40',
          )}
        >
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            enterKeyHint="done"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="0"
            className="h-16 w-full bg-transparent px-5 pr-14 font-display text-2xl font-extrabold text-champagne-900 placeholder:text-champagne-300 focus:outline-none dark:text-dark-50"
            autoComplete="off"
          />
          <span className="absolute right-5 top-1/2 -translate-y-1/2 text-lg font-bold text-champagne-400">
            {currencySymbol}
          </span>
        </div>
        <p className="font-mono text-[11px] text-champagne-500">
          {formatAmount(minRubles, 0)} – {formatAmount(maxRubles, 0)} {currencySymbol}
        </p>
      </div>

      {/* Quick amounts */}
      {quickAmounts.length > 0 && (
        <div className="grid grid-cols-4 gap-2.5">
          {quickAmounts.map((a) => {
            const val = getQuickValue(a);
            const isSelected = amount === val;
            return (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setAmount(val);
                  inputRef.current?.blur();
                }}
                className={cn(
                  'rounded-2xl border px-2 py-3 text-center transition-colors',
                  isSelected
                    ? 'border-accent-500/40 bg-accent-500/12 text-accent-600'
                    : 'border-champagne-300 bg-champagne-100 text-champagne-800 hover:bg-champagne-200 dark:border-dark-700 dark:bg-dark-800/60 dark:text-dark-200',
                )}
              >
                <span className="text-[15px] font-bold">{formatAmount(a, 0)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Pay */}
      <PillButton
        variant="primary"
        loading={isPending}
        disabled={!amountValid}
        onClick={handleSubmit}
      >
        {amountValid
          ? t('balance.details.pay', { amount: `${amount} ${currencySymbol}` })
          : t('balance.details.topup')}
      </PillButton>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-error-500/30 bg-error-500/10 p-3">
          <ExclamationIcon className="h-5 w-5 shrink-0 text-error-500" />
          <span className="text-sm text-error-500">{error}</span>
        </div>
      )}

      {/* Payment link panel */}
      {paymentUrl && (
        <div className="space-y-3 rounded-bento border border-success-500/30 bg-success-500/10 p-4">
          <div className="flex items-center gap-2 text-success-600">
            <CheckIcon className="h-5 w-5" />
            <span className="font-semibold">{t('balance.paymentReady')}</span>
          </div>
          <p className="text-sm text-champagne-700 dark:text-dark-300">
            {t('balance.clickToOpenPayment')}
          </p>
          <PillButton
            variant="dark"
            leadingIcon={<ExternalLinkIcon className="h-5 w-5" />}
            onClick={handleOpenPayment}
          >
            {t('balance.openPaymentPage')}
          </PillButton>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 rounded-lg border border-champagne-300 bg-champagne-50 px-3 py-2 dark:border-dark-700 dark:bg-dark-900/60">
              <p className="truncate text-xs text-champagne-500">{paymentUrl}</p>
            </div>
            <button
              type="button"
              onClick={handleCopyUrl}
              className={cn(
                'shrink-0 rounded-lg p-2.5 transition-colors',
                copied
                  ? 'bg-success-500/20 text-success-600'
                  : 'bg-champagne-100 text-champagne-500 hover:bg-champagne-200 dark:bg-dark-800/60',
              )}
              title={t('common.copy')}
            >
              {copied ? <CheckIcon className="h-5 w-5" /> : <CopyIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
