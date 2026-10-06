import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { PillButton } from '@/components/ui/PillButton';
import {
  PowerIcon,
  RefreshIcon,
  SparklesIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from '@/components/icons';
import { formatTraffic } from '@/utils/formatTraffic';
import { pluralizeDays } from '@/utils/pluralizeDays';
import type { Subscription } from '@/types';

/**
 * Светофор state — derived once in Dashboard, drives the entire card
 * (dot hue, label, right number, meta, CTA). See hi-fi §2.2 / §2.4.
 */
export type StatusCardState = 'protected' | 'expiring' | 'expired' | 'inactive';

interface StatusCardProps {
  state: StatusCardState;
  subscription: Subscription | null;
  /** ⚪ inactive only: is a free trial offer available? */
  trialAvailable?: boolean;
  /** ⚪ inactive only: has the user already used the trial? */
  trialUsed?: boolean;
  connectedDevices?: number;
  /** True while the trial activation mutation is in-flight (⚪ → optimistic 🟢). */
  trialActivating?: boolean;
  /** True while a renew mutation is in-flight (🟡/🔴). */
  renewing?: boolean;
  onActivateTrial?: () => void;
  onRenew?: () => void;
  /** Inline error surfaced under the CTA (trial / renew failures). */
  errorMessage?: string | null;
}

/** Status-hue lockout: only the dot/label carry status color; CTA stays brand-orange. */
const DOT_HUE: Record<StatusCardState, string> = {
  protected: 'bg-success-500',
  expiring: 'bg-warning-400',
  expired: 'bg-error-500',
  inactive: 'bg-champagne-500',
};

/**
 * StatusCard — unifies the three legacy dashboard cards
 * (`SubscriptionCardActive` / `SubscriptionCardExpired` / `TrialOfferCard`)
 * into one state-driven светофор card (hi-fi §2). The renew/trial mutations
 * live in Dashboard and are wired through `onRenew` / `onActivateTrial`.
 */
export default function StatusCard({
  state,
  subscription,
  trialAvailable = false,
  trialUsed = false,
  connectedDevices = 0,
  trialActivating = false,
  renewing = false,
  onActivateTrial,
  onRenew,
  errorMessage,
}: StatusCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const daysLeft = subscription?.days_left ?? 0;
  const isUnlimited = subscription ? subscription.traffic_limit_gb === 0 : false;
  const isLimited = subscription?.is_limited ?? false;
  const hasDevices = connectedDevices > 0;

  // ── Label (status hue lives in the dot; label text stays navy for legibility) ──
  const label = (() => {
    switch (state) {
      case 'protected':
        return t('home.status.active.title');
      case 'expiring':
        return t('home.status.expiring.title');
      case 'expired':
        return isLimited ? t('subscription.trafficLimitedTitle') : t('home.status.expired.title');
      case 'inactive':
        return t('home.status.none.title');
    }
  })();

  // ── Right-hand big number («N дней») — only when a sub is alive ──
  const showDays = state === 'protected' || state === 'expiring';

  // ── Meta row («Трафик: … · Устройств: N») — only when a sub exists ──
  const showMeta = state === 'protected' || state === 'expiring';
  const trafficLabel = isUnlimited
    ? t('home.meta.trafficUnlimited')
    : t('home.meta.trafficLeft', {
        amount: formatTraffic(
          Math.max(
            0,
            subscription ? subscription.traffic_limit_gb - subscription.traffic_used_gb : 0,
          ),
        ),
        total: formatTraffic(subscription?.traffic_limit_gb ?? 0),
      });

  // ── Subline for the ⚪ inactive state (trial offer / no-trial copy) ──
  const inactiveSubline =
    trialAvailable && !trialUsed
      ? t('home.status.none.subtitle')
      : t('home.status.none.subtitleTrialUsed');

  // ── CTA wiring per the §2.4 matrix ──
  const renderCta = () => {
    switch (state) {
      case 'protected':
        if (hasDevices) {
          // Calm ghost — nothing to do. Small connect-more link sits below.
          return (
            <div className="space-y-2.5">
              <PillButton
                variant="ghost"
                leadingIcon={<CheckCircleIcon className="h-5 w-5 text-success-500" />}
                onClick={() => undefined}
                aria-disabled
              >
                {t('home.status.active.allWorking')}
              </PillButton>
              <button
                type="button"
                onClick={() => navigate('/connect')}
                className="block w-full text-center text-[13px] font-medium text-accent-600 hover:underline"
              >
                {t('home.status.active.connectMore')}
              </button>
            </div>
          );
        }
        return (
          <PillButton
            variant="primary"
            leadingIcon={<PowerIcon className="h-5 w-5" />}
            onClick={() => navigate('/connect')}
          >
            {t('home.status.active.connectDevice')}
          </PillButton>
        );

      case 'expiring':
        return (
          <PillButton
            variant="primary"
            leadingIcon={<RefreshIcon className="h-5 w-5" />}
            loading={renewing}
            onClick={() =>
              onRenew ? onRenew() : navigate(`/subscription/${subscription?.id}/renew`)
            }
          >
            {t('home.status.expiring.button')}
          </PillButton>
        );

      case 'expired':
        return (
          <PillButton
            variant="primary"
            leadingIcon={<RefreshIcon className="h-5 w-5" />}
            loading={renewing}
            onClick={() => {
              if (isLimited && subscription) {
                navigate(`/subscription/${subscription.id}`);
                return;
              }
              if (onRenew) {
                onRenew();
                return;
              }
              navigate(
                subscription ? `/subscription/${subscription.id}/renew` : '/subscription/buy',
              );
            }}
          >
            {t('home.status.expired.button')}
          </PillButton>
        );

      case 'inactive':
        if (trialAvailable && !trialUsed) {
          return (
            <PillButton
              variant="primary"
              leadingIcon={<SparklesIcon className="h-5 w-5" />}
              loading={trialActivating}
              onClick={() => onActivateTrial?.()}
            >
              {t('home.status.none.button')}
            </PillButton>
          );
        }
        return (
          <PillButton
            variant="primary"
            leadingIcon={<ArrowRightIcon className="h-5 w-5" />}
            onClick={() => navigate('/subscription/buy')}
          >
            {t('home.status.none.buttonTrialUsed')}
          </PillButton>
        );
    }
  };

  return (
    <div
      className={cn(
        'rounded-4xl border border-champagne-300 bg-champagne-50 p-7 shadow-sm',
        'dark:border-dark-700/40 dark:bg-dark-900/60',
      )}
    >
      {/* Header: dot + label left, days right */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn('h-2.5 w-2.5 shrink-0 rounded-full transition-colors', DOT_HUE[state])}
            aria-hidden="true"
          />
          <h2 className="font-display text-xl font-bold leading-tight text-champagne-900 dark:text-dark-50">
            {label}
          </h2>
        </div>
        {showDays && (
          <div className="text-right leading-none">
            <span className="font-display text-[40px] font-extrabold leading-none text-champagne-900 dark:text-dark-50">
              {daysLeft}
            </span>
            <span className="ml-1 align-baseline text-sm font-medium text-champagne-500">
              {pluralizeDays(daysLeft).replace(/^\d+\s*/, '')}
            </span>
          </div>
        )}
      </div>

      {/* Meta row */}
      {showMeta && (
        <div className="mb-6 font-mono text-[11px] text-champagne-600 dark:text-dark-400">
          {trafficLabel}
          <span className="mx-2 text-champagne-400">·</span>
          {t('home.meta.devices', { n: connectedDevices })}
        </div>
      )}

      {/* Inactive subline (trial offer) */}
      {state === 'inactive' && (
        <p className="mb-6 text-sm text-champagne-600 dark:text-dark-400">{inactiveSubline}</p>
      )}

      {/* Inline error */}
      {errorMessage && (
        <div
          className="mb-4 rounded-xl border border-error-500/30 bg-error-500/10 p-3 text-center text-sm text-error-500"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      {/* CTA */}
      {renderCta()}
    </div>
  );
}
