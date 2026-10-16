import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router';

import { subscriptionApi } from '../api/subscription';
import { WebBackButton } from '../components/WebBackButton';
import { useDestructiveConfirm } from '../platform/hooks/useNativeDialog';
import { useHaptic } from '../platform';
import { useTheme } from '../hooks/useTheme';
import { formatTraffic } from '../utils/formatTraffic';
import { pluralizeDays } from '../utils/pluralizeDays';
import { getErrorMessage } from '../utils/subscriptionHelpers';
import { cn } from '@/lib/utils';

import { Kicker } from '@/components/ui/Kicker';
import { PillButton } from '@/components/ui/PillButton';
import {
  RefreshIcon,
  CheckIcon,
  DevicesIcon,
  ChevronDownIcon,
  GlobeIcon,
  BoltIcon,
  TrashIcon,
  PencilIcon,
  PowerIcon,
} from '@/components/icons';

import { DEVICE_ALIAS_MAX_LENGTH } from '../constants/devices';
import { DeviceTopupSheet } from '../components/subscription/sheets/DeviceTopupSheet';
import { DeviceReductionSheet } from '../components/subscription/sheets/DeviceReductionSheet';
import { TrafficTopupSheet } from '../components/subscription/sheets/TrafficTopupSheet';
import { ServerManagementSheet } from '../components/subscription/sheets/ServerManagementSheet';
import { DeleteSubscriptionSheet } from '../components/subscription/sheets/DeleteSubscriptionSheet';
import { Skeleton } from '@/components/ui/skeleton';
import { safeLocal } from '@/utils/safeStorage';

/**
 * Подписка — details «моя подписка» (NOTES_IA §3.3, copy spec §C).
 *
 * A landing-style restyle of the legacy `Subscription.tsx` (1696 lines): a clean
 * "my subscription" home — светофор status + days, plain plan description,
 * «Продлить» primary, «Сменить тариф / страну», autopay toggle, device
 * management, and «Обновить доступ» tucked behind an advanced disclosure.
 *
 * REMOVED vs legacy (now live in «Подключить»): connection-link / QR / config /
 * protocol blocks. Daily-tariff pause support is kept. Net-new flows (device /
 * traffic top-up, change-country, change-tariff, revoke) reuse the SAME existing
 * sheets + mutations; this screen only re-spines the shell. No new endpoints.
 */

type StatusTone = 'protected' | 'expiring' | 'expired' | 'inactive';

const DOT_HUE: Record<StatusTone, string> = {
  protected: 'bg-success-500',
  expiring: 'bg-warning-400',
  expired: 'bg-error-500',
  inactive: 'bg-champagne-500',
};

export default function SubscriptionDetail() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const haptic = useHaptic();
  const destructiveConfirm = useDestructiveConfirm();
  const { isDark } = useTheme();

  const { subscriptionId: subIdParam } = useParams<{ subscriptionId?: string }>();
  const subscriptionId = subIdParam ? parseInt(subIdParam, 10) : undefined;

  // Advanced disclosure (revoke + reduce-devices live here, low-prominence).
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Sheet toggles (reused, unchanged components).
  const [showDeviceTopup, setShowDeviceTopup] = useState(false);
  const [devicesToAdd, setDevicesToAdd] = useState(1);
  const [showDeviceReduction, setShowDeviceReduction] = useState(false);
  const [targetDeviceLimit, setTargetDeviceLimit] = useState<number>(1);
  const [showTrafficTopup, setShowTrafficTopup] = useState(false);
  const [selectedTrafficPackage, setSelectedTrafficPackage] = useState<number | null>(null);
  const [showServerManagement, setShowServerManagement] = useState(false);
  const [selectedServersToUpdate, setSelectedServersToUpdate] = useState<string[]>([]);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  // Revoke («Обновить доступ») cooldown — same localStorage key as legacy.
  const [revokeCooldown, setRevokeCooldown] = useState(0);

  // ── Queries ──
  const { data: multiSubData } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 60_000,
  });
  const isMultiTariff = multiSubData?.multi_tariff_enabled ?? false;

  const {
    data: subscriptionResponse,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['subscription', subscriptionId],
    queryFn: () => subscriptionApi.getSubscription(subscriptionId),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const subscription = subscriptionResponse?.subscription ?? null;

  const { data: purchaseOptions } = useQuery({
    queryKey: ['purchase-options', subscriptionId],
    queryFn: () => subscriptionApi.getPurchaseOptions(subscriptionId),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const isTariffsMode = purchaseOptions?.sales_mode === 'tariffs';

  const { data: devicesData, isLoading: devicesLoading } = useQuery({
    queryKey: ['devices', subscriptionId],
    queryFn: () => subscriptionApi.getDevices(subscriptionId),
    enabled: !!subscription,
  });

  // ── Mutations (reuse legacy logic) ──
  const autopayMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      subscriptionApi.updateAutopay(enabled, undefined, subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription', subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      haptic.notification('success');
    },
    onError: () => haptic.notification('error'),
  });

  const pauseMutation = useMutation({
    mutationFn: () => subscriptionApi.togglePause(subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription', subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
    },
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: (hwid: string) => subscriptionApi.deleteDevice(hwid, subscriptionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices', subscriptionId] }),
  });
  const deleteAllDevicesMutation = useMutation({
    mutationFn: () => subscriptionApi.deleteAllDevices(subscriptionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices', subscriptionId] }),
  });

  const [editingDeviceHwid, setEditingDeviceHwid] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState('');
  const renameDeviceMutation = useMutation({
    mutationFn: ({ hwid, name }: { hwid: string; name: string | null }) =>
      subscriptionApi.renameDevice(hwid, name, subscriptionId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['devices', subscriptionId] });
      haptic.notification('success');
      setEditingDeviceHwid((current) => (current === variables.hwid ? null : current));
    },
    onError: () => haptic.notification('error'),
  });

  const revokeMutation = useMutation({
    mutationFn: () => subscriptionApi.revokeSubscription(subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['devices', subscriptionId] });
      haptic.notification('success');
      safeLocal.setItem(`revoke_ts_${subscriptionId ?? 'default'}`, Date.now().toString());
      setRevokeCooldown(900);
    },
    onError: () => haptic.notification('error'),
  });

  // Init + tick revoke cooldown from localStorage (15 min window).
  useEffect(() => {
    const ts = safeLocal.getItem(`revoke_ts_${subscriptionId ?? 'default'}`);
    if (ts) {
      const elapsed = Math.floor((Date.now() - parseInt(ts, 10)) / 1000);
      setRevokeCooldown(Math.max(0, 900 - elapsed));
    }
  }, [subscriptionId]);
  useEffect(() => {
    if (revokeCooldown <= 0) return;
    const timer = setInterval(() => setRevokeCooldown((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [revokeCooldown]);

  const handleRefreshAccess = useCallback(async () => {
    const confirmed = await destructiveConfirm(
      t('subscription.details.action.refreshWarning'),
      t('subscription.details.action.refreshConfirm'),
      t('subscription.details.action.refreshAccess'),
    );
    if (confirmed) revokeMutation.mutate();
  }, [destructiveConfirm, revokeMutation, t]);

  // ── Derived status tone ──
  const tone = useMemo<StatusTone>(() => {
    if (!subscription) return 'inactive';
    if (subscription.is_limited) return 'expired';
    if (!subscription.is_active) return 'expired';
    if (subscription.days_left <= 5) return 'expiring';
    return 'protected';
  }, [subscription]);

  const statusLabel = (() => {
    switch (tone) {
      case 'protected':
        return t('subscription.details.status.active');
      case 'expiring':
        return t('subscription.details.status.expiring');
      case 'expired':
        return t('subscription.details.status.expired');
      case 'inactive':
        return t('subscription.details.status.none');
    }
  })();

  // ── Guards ──
  if (isMultiTariff && !subscriptionId && !isLoading) {
    return <Navigate to="/subscriptions" replace />;
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton variant="card" className="h-48 w-full rounded-4xl" />
        <Skeleton variant="card" className="h-32 w-full rounded-bento" />
      </div>
    );
  }

  if (isError || (!subscription && subscriptionId)) {
    return (
      <div className="space-y-5">
        <WebBackButton to={isMultiTariff ? '/subscriptions' : '/'} />
        <div className="rounded-4xl border border-champagne-300 bg-champagne-50 p-7 text-center dark:border-dark-700/40 dark:bg-dark-900/60">
          <p className="mb-5 text-[15px] text-champagne-700 dark:text-dark-300">
            {t('subscription.details.loadError')}
          </p>
          <PillButton variant="ghost" fullWidth={false} onClick={() => navigate('/subscriptions')}>
            {t('subscription.backToList')}
          </PillButton>
        </div>
      </div>
    );
  }

  const daysLeft = subscription?.days_left ?? 0;
  const isUnlimited = subscription ? subscription.traffic_limit_gb === 0 : false;
  const isLimited = subscription?.is_limited ?? false;
  const connectedDevices = devicesData?.total ?? 0;
  const deviceLimit = subscription?.device_limit ?? 0;
  const isAtDeviceLimit = deviceLimit > 0 && connectedDevices >= deviceLimit;
  const showDays = tone === 'protected' || tone === 'expiring';
  const endDate = subscription?.end_date
    ? new Date(subscription.end_date).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
      })
    : '';

  const isActiveSub = !!subscription && (subscription.is_active || subscription.is_limited);
  const isTrial = subscription?.is_trial ?? false;
  const isDaily = subscription?.is_daily ?? false;

  const trafficLeftGb = subscription
    ? Math.max(0, subscription.traffic_limit_gb - subscription.traffic_used_gb)
    : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <WebBackButton to={isMultiTariff ? '/subscriptions' : '/'} />
        <div>
          <Kicker className="mb-1">{t('subscription.title')}</Kicker>
          <h1 className="font-display text-2xl font-bold text-champagne-900 dark:text-dark-50">
            {isMultiTariff && subscription?.tariff_name
              ? subscription.tariff_name
              : t('subscription.title')}
          </h1>
        </div>
      </div>

      {/* ── Status card (светофор) ── */}
      {subscription ? (
        <div className="rounded-4xl border border-champagne-300 bg-champagne-50 p-7 shadow-sm dark:border-dark-700/40 dark:bg-dark-900/60">
          {/* dot + status + days */}
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT_HUE[tone])}
                aria-hidden="true"
              />
              <h2 className="font-display text-xl font-bold leading-tight text-champagne-900 dark:text-dark-50">
                {statusLabel}
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

          {/* validity / expiry line */}
          {endDate && (
            <p className="mb-6 font-mono text-[11px] text-champagne-600 dark:text-dark-400">
              {tone === 'expired'
                ? t('subscription.details.expiredOn', { date: endDate })
                : t('subscription.details.validUntil', { date: endDate })}
            </p>
          )}

          {/* primary action: extend / buy */}
          <PillButton
            variant="primary"
            leadingIcon={<RefreshIcon className="h-5 w-5" />}
            onClick={() =>
              navigate(
                subscription
                  ? `/subscription/buy?subscriptionId=${subscription.id}`
                  : '/subscription/buy',
              )
            }
          >
            {isActiveSub
              ? t('subscription.details.action.extend')
              : t('subscription.details.action.buy')}
          </PillButton>

          {/* secondary: change plan / change country */}
          {isActiveSub && !isTrial && (
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <PillButton
                variant="soft"
                onClick={() => navigate(`/subscription/buy?subscriptionId=${subscription.id}`)}
              >
                {t('subscription.details.action.changePlan')}
              </PillButton>
              {!isTariffsMode && (
                <PillButton
                  variant="soft"
                  leadingIcon={<GlobeIcon className="h-5 w-5" />}
                  onClick={() => setShowServerManagement(true)}
                >
                  {t('subscription.details.action.changeCountry')}
                </PillButton>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-4xl border border-champagne-300 bg-champagne-50 p-7 text-center dark:border-dark-700/40 dark:bg-dark-900/60">
          <p className="mb-5 text-[15px] text-champagne-700 dark:text-dark-300">
            {t('subscription.details.none.text')}
          </p>
          <PillButton variant="primary" onClick={() => navigate('/subscription/buy')}>
            {t('subscription.details.action.buy')}
          </PillButton>
        </div>
      )}

      {/* ── Plan description (plain, no tech) ── */}
      {subscription && (
        <section className="rounded-bento border border-champagne-300 bg-champagne-50 p-6 dark:border-dark-700/40 dark:bg-dark-900/60">
          <h3 className="mb-4 font-display text-base font-bold text-champagne-900 dark:text-dark-50">
            {t('subscription.details.plan.title')}
          </h3>
          <ul className="space-y-3 text-[14px] text-champagne-800 dark:text-dark-200">
            <PlanRow icon={<BoltIcon className="h-4 w-4" />}>
              {isUnlimited
                ? t('subscription.details.plan.trafficUnlimited')
                : isLimited
                  ? t('subscription.details.plan.trafficLimited', {
                      amount: formatTraffic(subscription.traffic_limit_gb),
                    })
                  : t('subscription.details.plan.trafficLeft', {
                      amount: formatTraffic(trafficLeftGb),
                    })}
            </PlanRow>
            <PlanRow icon={<DevicesIcon className="h-4 w-4" />}>
              {deviceLimit === 0
                ? t('subscription.details.plan.devicesUnlimited')
                : t('subscription.details.plan.devices', { n: deviceLimit })}
            </PlanRow>
            <PlanRow icon={<GlobeIcon className="h-4 w-4" />}>
              {t('subscription.details.plan.countries')}
            </PlanRow>
            <PlanRow icon={<BoltIcon className="h-4 w-4" />}>
              {t('subscription.details.plan.speed')}
            </PlanRow>
          </ul>
        </section>
      )}

      {/* ── Daily-tariff pause (kept) ── */}
      {subscription && isDaily && !isTrial && (
        <section className="rounded-bento border border-champagne-300 bg-champagne-50 p-5 dark:border-dark-700/40 dark:bg-dark-900/60">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold text-champagne-900 dark:text-dark-50">
                {t('subscription.pause.title')}
              </div>
              <div className="mt-0.5 text-[12px] text-champagne-600 dark:text-dark-400">
                {subscription.is_daily_paused
                  ? t('subscription.pause.paused')
                  : t('subscription.pause.active')}
              </div>
            </div>
            <PillButton
              variant={subscription.is_daily_paused ? 'primary' : 'soft'}
              fullWidth={false}
              loading={pauseMutation.isPending}
              onClick={() => pauseMutation.mutate()}
            >
              {subscription.is_daily_paused
                ? t('subscription.pause.resumeBtn')
                : t('subscription.pause.pauseBtn')}
            </PillButton>
          </div>
          {pauseMutation.isError && (
            <p className="mt-3 text-sm text-error-500">{getErrorMessage(pauseMutation.error)}</p>
          )}
        </section>
      )}

      {/* ── Autopay toggle ── */}
      {subscription && !isTrial && !isDaily && (
        <section className="flex items-center justify-between gap-3 rounded-bento border border-champagne-300 bg-champagne-50 p-5 dark:border-dark-700/40 dark:bg-dark-900/60">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-champagne-900 dark:text-dark-50">
              {t('subscription.details.autopay.title')}
            </div>
            <div className="mt-0.5 text-[12px] text-champagne-600 dark:text-dark-400">
              {subscription.autopay_enabled
                ? t('subscription.details.autopay.onHint')
                : t('subscription.details.autopay.offHint')}
            </div>
          </div>
          <button
            onClick={() => autopayMutation.mutate(!subscription.autopay_enabled)}
            disabled={autopayMutation.isPending}
            role="switch"
            aria-checked={subscription.autopay_enabled}
            aria-label={t('subscription.details.autopay.title')}
            className={cn(
              'relative h-7 w-[52px] shrink-0 rounded-full transition-colors duration-300',
              subscription.autopay_enabled ? 'bg-accent-500' : 'bg-champagne-300 dark:bg-dark-700',
            )}
          >
            <span
              className="absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-transform duration-300"
              style={{
                transform: subscription.autopay_enabled ? 'translateX(23px)' : 'translateX(0)',
              }}
            />
          </button>
        </section>
      )}

      {/* ── Devices ── */}
      {subscription && (
        <section className="rounded-bento border border-champagne-300 bg-champagne-50 p-6 dark:border-dark-700/40 dark:bg-dark-900/60">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-display text-base font-bold text-champagne-900 dark:text-dark-50">
              {t('subscription.details.devices.title')}
            </h3>
            {devicesData && devicesData.devices.length > 0 && (
              <button
                onClick={async () => {
                  const confirmed = await destructiveConfirm(
                    t('subscription.details.devices.removeAllConfirm'),
                    t('subscription.details.devices.removeAll'),
                    t('subscription.details.devices.removeAll'),
                  );
                  if (confirmed) deleteAllDevicesMutation.mutate();
                }}
                disabled={deleteAllDevicesMutation.isPending}
                className="text-[12px] font-medium text-error-500 hover:underline"
              >
                {t('subscription.details.devices.removeAll')}
              </button>
            )}
          </div>

          <div className="mb-4 font-mono text-[11px] text-champagne-600 dark:text-dark-400">
            {deviceLimit === 0
              ? t('subscription.details.devices.subtitleUnlimited', { n: connectedDevices })
              : t('subscription.details.devices.subtitle', {
                  n: connectedDevices,
                  max: deviceLimit,
                })}
          </div>

          {devicesLoading ? (
            <div className="flex justify-center py-6">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
            </div>
          ) : devicesData && devicesData.devices.length > 0 ? (
            <div className="space-y-2">
              {devicesData.devices.map((device) => {
                const isEditing = editingDeviceHwid === device.hwid;
                const displayName =
                  (device.local_name && device.local_name.trim()) ||
                  device.device_model ||
                  device.platform;
                return (
                  <div
                    key={device.hwid}
                    className="flex items-center justify-between gap-3 rounded-[14px] border border-champagne-300 bg-champagne-100 p-3.5 dark:border-dark-700/40 dark:bg-dark-800/40"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-champagne-200 text-champagne-700 dark:bg-dark-700 dark:text-dark-200">
                        <DevicesIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <input
                            type="text"
                            autoFocus
                            value={editingDeviceName}
                            maxLength={DEVICE_ALIAS_MAX_LENGTH}
                            placeholder={device.device_model || device.platform}
                            onChange={(e) => setEditingDeviceName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                renameDeviceMutation.mutate({
                                  hwid: device.hwid,
                                  name: editingDeviceName.trim() || null,
                                });
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingDeviceHwid(null);
                                setEditingDeviceName('');
                              }
                            }}
                            className="w-full rounded-md border border-champagne-300 bg-white px-2 py-1 text-sm font-semibold text-champagne-900 outline-none focus:ring-2 focus:ring-accent-500/40 dark:border-dark-700 dark:bg-dark-900 dark:text-dark-50"
                          />
                        ) : (
                          <div className="truncate text-sm font-semibold text-champagne-900 dark:text-dark-50">
                            {displayName}
                          </div>
                        )}
                        <div className="mt-0.5 truncate text-[11px] text-champagne-500 dark:text-dark-400">
                          {device.platform}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              renameDeviceMutation.mutate({
                                hwid: device.hwid,
                                name: editingDeviceName.trim() || null,
                              })
                            }
                            disabled={renameDeviceMutation.isPending}
                            className="p-2 text-champagne-600 hover:text-champagne-900 dark:text-dark-300"
                            aria-label={t('subscription.renameDeviceSave')}
                          >
                            <CheckIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDeviceHwid(null);
                              setEditingDeviceName('');
                            }}
                            className="p-2 text-champagne-400 hover:text-champagne-700"
                            aria-label={t('subscription.renameDeviceCancel')}
                          >
                            <span className="text-base leading-none">✕</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDeviceHwid(device.hwid);
                              setEditingDeviceName(device.local_name || '');
                            }}
                            className="p-2 text-champagne-400 hover:text-champagne-700 dark:text-dark-400"
                            aria-label={t('subscription.details.devices.rename')}
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const confirmed = await destructiveConfirm(
                                t('subscription.details.devices.removeConfirmText'),
                                t('subscription.details.devices.remove'),
                                t('subscription.details.devices.removeConfirmTitle'),
                              );
                              if (confirmed) deleteDeviceMutation.mutate(device.hwid);
                            }}
                            disabled={deleteDeviceMutation.isPending}
                            className="p-2 text-champagne-400 hover:text-error-500 dark:text-dark-400"
                            aria-label={t('subscription.details.devices.remove')}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center text-[13px] text-champagne-500 dark:text-dark-400">
              {t('subscription.details.devices.empty')}
            </div>
          )}

          {/* add device → Подключить */}
          <div className="mt-4">
            <PillButton
              variant="ghost"
              leadingIcon={<PowerIcon className="h-5 w-5" />}
              disabled={isAtDeviceLimit}
              onClick={() =>
                navigate(subscriptionId ? `/connect?sub=${subscriptionId}` : '/connect')
              }
            >
              {isAtDeviceLimit
                ? t('subscription.details.devices.limitReached')
                : t('subscription.details.devices.add')}
            </PillButton>
            {isAtDeviceLimit && (
              <p className="mt-2 text-center text-[12px] text-champagne-500 dark:text-dark-400">
                {t('subscription.details.devices.limitReachedHint')}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Advanced disclosure: top-ups + refresh-access + delete ── */}
      {subscription && isActiveSub && !isTrial && (
        <div className="border-t border-champagne-300 pt-4 dark:border-dark-700/40">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center justify-between text-[14px] font-medium text-champagne-600 hover:text-champagne-900 dark:text-dark-400"
          >
            <span>{t('subscription.details.advanced')}</span>
            <ChevronDownIcon
              className={cn('h-5 w-5 transition-transform', showAdvanced && 'rotate-180')}
            />
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4">
              {/* Top-ups: devices / traffic (reused sheets) */}
              {deviceLimit !== 0 && (
                <section className="rounded-bento border border-champagne-300 bg-champagne-50 p-5 dark:border-dark-700/40 dark:bg-dark-900/60">
                  <h4 className="mb-4 text-[14px] font-semibold text-champagne-900 dark:text-dark-50">
                    {t('subscription.details.manageMore')}
                  </h4>
                  <DeviceTopupSheet
                    open={showDeviceTopup}
                    onOpen={() => setShowDeviceTopup(true)}
                    onClose={() => setShowDeviceTopup(false)}
                    subscription={subscription}
                    subscriptionId={subscriptionId}
                    devicesToAdd={devicesToAdd}
                    onDevicesToAddChange={setDevicesToAdd}
                    purchaseOptions={purchaseOptions}
                    isDark={isDark}
                  />
                  <div className="mt-3">
                    <DeviceReductionSheet
                      open={showDeviceReduction}
                      onOpen={() => setShowDeviceReduction(true)}
                      onClose={() => setShowDeviceReduction(false)}
                      subscriptionPresent={!!subscription}
                      subscriptionId={subscriptionId}
                      targetDeviceLimit={targetDeviceLimit}
                      onTargetDeviceLimitChange={setTargetDeviceLimit}
                      isDark={isDark}
                    />
                  </div>
                  {subscription.traffic_limit_gb > 0 && (
                    <div className="mt-3">
                      <TrafficTopupSheet
                        open={showTrafficTopup}
                        onOpen={() => setShowTrafficTopup(true)}
                        onClose={() => setShowTrafficTopup(false)}
                        subscription={subscription}
                        subscriptionId={subscriptionId}
                        selectedTrafficPackage={selectedTrafficPackage}
                        onSelectedTrafficPackageChange={setSelectedTrafficPackage}
                        purchaseOptions={purchaseOptions}
                        isDark={isDark}
                      />
                    </div>
                  )}
                </section>
              )}

              {/* Refresh access («Обновить доступ» — ex «перевыпуск») */}
              <button
                onClick={handleRefreshAccess}
                disabled={revokeMutation.isPending || revokeCooldown > 0}
                className="w-full rounded-bento border border-warning-400/40 bg-warning-400/10 p-4 text-left transition-colors hover:bg-warning-400/20 disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-semibold text-champagne-900 dark:text-dark-50">
                      {t('subscription.details.action.refreshAccess')}
                    </div>
                    <div className="mt-1 text-[12px] text-champagne-600 dark:text-dark-400">
                      {revokeCooldown > 0
                        ? t('subscription.details.action.refreshCooldown', {
                            minutes: Math.floor(revokeCooldown / 60),
                            seconds: revokeCooldown % 60,
                          })
                        : t('subscription.details.action.refreshAccessHint')}
                    </div>
                  </div>
                  <RefreshIcon
                    className="h-5 w-5 shrink-0 text-warning-500"
                    spinning={revokeMutation.isPending}
                  />
                </div>
              </button>
              {revokeMutation.error && (
                <p className="text-sm text-error-500">{getErrorMessage(revokeMutation.error)}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete an expired subscription (multi-tariff only) — reuse sheet */}
      {isMultiTariff &&
        subscription &&
        !subscription.is_active &&
        !subscription.is_trial &&
        !subscription.is_limited && (
          <DeleteSubscriptionSheet
            subscriptionId={subscription.id}
            open={showDeleteSheet}
            onOpen={() => setShowDeleteSheet(true)}
            onClose={() => setShowDeleteSheet(false)}
            textSecondary="rgb(var(--color-champagne-600))"
            onDeleted={() => {
              queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
              navigate('/subscriptions', { replace: true });
            }}
          />
        )}

      {/* Change-country sheet (mounted, toggled from status card) */}
      {subscription && isActiveSub && !isTariffsMode && (
        <div className={showServerManagement ? '' : 'hidden'}>
          <ServerManagementSheet
            open={showServerManagement}
            onOpen={() => setShowServerManagement(true)}
            onClose={() => setShowServerManagement(false)}
            subscription={subscription}
            subscriptionId={subscriptionId}
            selectedServers={selectedServersToUpdate}
            onSelectedServersChange={setSelectedServersToUpdate}
            purchaseOptions={purchaseOptions}
            isDark={isDark}
          />
        </div>
      )}
    </div>
  );
}

function PlanRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-500/12 text-accent-600">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}
