import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import { useAuthStore } from '../store/auth';
import { useBlockingStore } from '../store/blocking';
import { subscriptionApi } from '../api/subscription';
import { balanceApi } from '../api/balance';
import Onboarding, { useOnboarding } from '../components/Onboarding';
import OnboardingWizard, { useOnboardingWizard } from '../components/OnboardingWizard';
import StatusCard, { type StatusCardState } from '../components/dashboard/StatusCard';
import SubscriptionListCard from '../components/subscription/SubscriptionListCard';
import { getInsufficientBalanceError } from '../utils/subscriptionHelpers';
import { Kicker } from '@/components/ui/Kicker';
import { PillButton } from '@/components/ui/PillButton';
import { ArrowRightIcon, GiftIcon } from '@/components/icons';
import { API } from '../config/constants';
import { getApiErrorMessage } from '../utils/api-error';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';

// Yellow светофор threshold — show "expiring" at or below this many days (hi-fi §2.2).
const EXPIRING_THRESHOLD_DAYS = 5;

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const queryClient = useQueryClient();
  const { isCompleted: isOnboardingCompleted, complete: completeOnboarding } = useOnboarding();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { isSeen: wizardSeen, markSeen: markWizardSeen } = useOnboardingWizard();
  const blockingType = useBlockingStore((state) => state.blockingType);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [renewError, setRenewError] = useState<string | null>(null);
  const [isRenewing, setIsRenewing] = useState(false);

  // Refresh user data on mount
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
  });

  // Multi-tariff: check if user has multiple subscriptions
  const { data: multiSubData } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 60_000,
  });
  const isMultiTariff = multiSubData?.multi_tariff_enabled ?? false;

  const { data: subscriptionResponse, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => subscriptionApi.getSubscription(),
    retry: false,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
    enabled: !isMultiTariff,
  });

  const subscription = subscriptionResponse?.subscription ?? null;

  const { data: trialInfo, isLoading: trialLoading } = useQuery({
    queryKey: ['trial-info'],
    queryFn: () => subscriptionApi.getTrialInfo(),
    enabled: !subscription && !subLoading,
  });

  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: () => subscriptionApi.getDevices(),
    enabled: !!subscription && !isMultiTariff,
    staleTime: API.BALANCE_STALE_TIME_MS,
  });

  const activateTrialMutation = useMutation({
    mutationFn: () => subscriptionApi.activateTrial(),
    onSuccess: () => {
      setTrialError(null);
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['trial-info'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-options'] });
      refreshUser();
      // After the trial flips us green, nudge the user toward connecting.
      navigate('/connect');
    },
    onError: (error: unknown) => {
      setTrialError(getApiErrorMessage(error, t('common.error')));
    },
  });

  // Quick-renew (mirrors upstream SubscriptionCardExpired): only daily tariffs
  // renew instantly (resume a paused daily / buy one more day). A regular
  // subscription goes to the period picker — never charge a fixed month silently
  // (it skips long-period discounts and fails when the tariff isn't sold monthly).
  const handleQuickRenew = async () => {
    const isInstantRenew =
      !!subscription &&
      subscription.is_daily &&
      (subscription.status === 'disabled' || !!subscription.tariff_id);
    if (!subscription || !isInstantRenew) {
      navigate(
        subscription ? `/subscription/buy?subscriptionId=${subscription.id}` : '/subscription/buy',
      );
      return;
    }
    setIsRenewing(true);
    setRenewError(null);
    try {
      if (subscription.status === 'disabled') {
        await subscriptionApi.togglePause(subscription.id);
      } else if (subscription.tariff_id) {
        await subscriptionApi.purchaseTariff(subscription.tariff_id, 1, undefined, subscription.id);
      }
      queryClient.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'subscription',
      });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-options'] });
    } catch (err: unknown) {
      if (getInsufficientBalanceError(err)) {
        // Not enough balance — send the user to renew/top-up rather than failing silently.
        navigate(`/subscription/buy?subscriptionId=${subscription.id}`);
        return;
      }
      if (err instanceof AxiosError && typeof err.response?.data?.detail === 'string') {
        setRenewError(err.response.data.detail);
      } else {
        setRenewError(t('dashboard.expired.renewError'));
      }
    } finally {
      setIsRenewing(false);
    }
  };

  // ── Derive the светофор state once (hi-fi §2.2) ──
  const hasNoSubscription = isMultiTariff
    ? multiSubData !== undefined && (multiSubData.subscriptions?.length ?? 0) === 0
    : subscriptionResponse?.has_subscription === false && !subLoading;

  const statusState: StatusCardState = useMemo(() => {
    if (!subscription) return 'inactive';
    if (subscription.is_expired || subscription.status === 'disabled' || subscription.is_limited) {
      return 'expired';
    }
    if (subscription.days_left <= EXPIRING_THRESHOLD_DAYS) return 'expiring';
    return 'protected';
  }, [subscription]);

  const connectedDevices = devicesData?.total ?? 0;
  const trialAvailable = trialInfo?.is_available ?? false;

  // Onboarding (Layer B coach-marks) — point at the светофор + Подключить tab.
  useEffect(() => {
    if (wizardSeen && !isOnboardingCompleted && !subLoading && !blockingType) {
      const timer = setTimeout(() => setShowOnboarding(true), 500);
      return () => clearTimeout(timer);
    }
  }, [wizardSeen, isOnboardingCompleted, subLoading, blockingType]);

  const onboardingSteps = useMemo(() => {
    type Placement = 'top' | 'bottom' | 'left' | 'right';
    return [
      {
        target: 'status-card',
        title: t('onboarding.steps.welcome.title'),
        description: t('onboarding.steps.welcome.description'),
        placement: 'bottom' as Placement,
      },
    ];
  }, [t]);

  const handleOnboardingComplete = () => {
    completeOnboarding();
    setShowOnboarding(false);
  };

  // Loading skeleton for the status card
  const showSkeleton = !isMultiTariff && subLoading;
  // Trial branch still resolving — avoid a flash of the ⚪ card before trialInfo lands.
  const trialPending = hasNoSubscription && trialLoading;

  // ── Contextual card (exactly ONE, by priority — hi-fi §2.5) ──
  // 🔴/🟡 → none (renew is already the CTA). ⚪ → none (single trial CTA).
  // 🟢 → invite-friend (growth).
  const showInviteCard = statusState === 'protected';

  return (
    <div className="space-y-0">
      <Kicker className="mb-3">{t('home.kicker')}</Kicker>

      {/* Multi-tariff: keep the existing list (out of scope for this slice's redesign). */}
      {isMultiTariff && multiSubData?.subscriptions && multiSubData.subscriptions.length > 0 ? (
        <div className="space-y-3">
          {multiSubData.subscriptions.slice(0, 3).map((sub) => (
            <SubscriptionListCard
              key={sub.id}
              subscription={sub}
              onClick={() => navigate(`/subscription/${sub.id}`)}
            />
          ))}
          <PillButton
            variant="primary"
            leadingIcon={<ArrowRightIcon className="h-5 w-5" />}
            onClick={() => navigate('/subscription/buy')}
          >
            {t('subscriptions.browsePlans', 'Посмотреть тарифы и купить подписку')}
          </PillButton>
        </div>
      ) : showSkeleton || trialPending ? (
        <SkeletonGroup className="rounded-4xl border border-champagne-300 bg-champagne-50 p-7 dark:border-dark-700/40 dark:bg-dark-900/60">
          <div className="mb-5 flex items-center justify-between">
            <Skeleton className="h-6 w-32 rounded-lg" />
            <Skeleton className="h-10 w-16 rounded-lg" />
          </div>
          <Skeleton className="mb-6 h-4 w-48 rounded" />
          <Skeleton className="h-14 w-full rounded-full" />
        </SkeletonGroup>
      ) : (
        <div data-onboarding="status-card">
          <StatusCard
            state={statusState}
            subscription={subscription}
            trialAvailable={trialAvailable}
            trialUsed={!trialAvailable && hasNoSubscription}
            connectedDevices={connectedDevices}
            trialActivating={activateTrialMutation.isPending}
            renewing={isRenewing}
            onActivateTrial={() =>
              !activateTrialMutation.isPending && activateTrialMutation.mutate()
            }
            onRenew={handleQuickRenew}
            errorMessage={statusState === 'inactive' ? trialError : renewError}
          />
        </div>
      )}

      {/* Balance chip — inline, low-prominence, neutral (hi-fi §2.3) */}
      <div className="mt-4 flex items-center justify-between rounded-full border border-champagne-300 bg-champagne-100 px-4 py-2.5 dark:border-dark-700/40 dark:bg-dark-800/60">
        <span className="font-mono text-[11px] uppercase tracking-wider text-champagne-600 dark:text-dark-400">
          {t('home.balance.label')}{' '}
          <span className="font-sans font-semibold normal-case tracking-normal text-champagne-900 dark:text-dark-50">
            {(balanceData?.balance_rubles ?? 0).toLocaleString('ru-RU')} ₽
          </span>
        </span>
        <Link
          to="/subscription/balance/top-up"
          className="text-[13px] font-medium text-accent-600 hover:underline"
        >
          {t('home.balance.topup')}
        </Link>
      </div>

      {/* One contextual card (invite-friend on 🟢) */}
      {showInviteCard && (
        <Link
          to="/account/invite"
          className="mt-3 flex items-center gap-3 rounded-bento border border-champagne-300 bg-champagne-100 p-4 transition-colors hover:bg-champagne-200 dark:border-dark-700/40 dark:bg-dark-800/60"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/10 text-accent-600">
            <GiftIcon className="h-5 w-5" />
          </span>
          <span className="flex-1 text-[14px] font-medium text-champagne-900 dark:text-dark-50">
            {t('home.invite.title')}
          </span>
          <ArrowRightIcon className="h-5 w-5 shrink-0 text-champagne-500" />
        </Link>
      )}

      {/* Onboarding value wizard (Layer A) — value-first, shown before the tour */}
      {!wizardSeen && hasNoSubscription && (
        <OnboardingWizard
          onTrial={() => {
            markWizardSeen();
            activateTrialMutation.mutate();
          }}
          onBuy={() => {
            markWizardSeen();
            navigate('/subscription/buy');
          }}
          onClose={markWizardSeen}
        />
      )}

      {/* Onboarding Tutorial (Layer B coach-marks) */}
      {showOnboarding && (
        <Onboarding
          steps={onboardingSteps}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingComplete}
        />
      )}
    </div>
  );
}
