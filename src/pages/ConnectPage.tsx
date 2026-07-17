import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { openLink as sdkOpenLink } from '@telegram-apps/sdk-react';

import { subscriptionApi } from '../api/subscription';
import { useTelegramSDK } from '../hooks/useTelegramSDK';
import { useHaptic, useNotify } from '@/platform';
import { useAuthStore } from '../store/auth';
import { resolveTemplate, hasTemplates } from '../utils/templateEngine';
import { isHappCryptolinkMode, resolveConnectionUrlForUi } from '../utils/connectionLink';
import { copyToClipboard } from '../utils/clipboard';
import { detectPlatform, platformDetectKey, type DetectedPlatform } from '../utils/detectPlatform';
import { cn } from '@/lib/utils';
import type { AppConfig, RemnawaveAppClient, RemnawavePlatformData } from '../types';

import { Kicker } from '@/components/ui/Kicker';
import { PillButton } from '@/components/ui/PillButton';
import { AnimatedCheckmark } from '@/components/ui/AnimatedCheckmark';
import { WebBackButton } from '@/components/WebBackButton';
import InstallationGuide from '../components/connection/InstallationGuide';
import ConnectQRSheet from '../components/connection/ConnectQRSheet';
import {
  PowerIcon,
  DownloadIcon,
  CopyIcon,
  LinkIcon,
  PencilIcon,
  ChevronDownIcon,
  SettingsIcon,
  ArrowRightIcon,
} from '@/components/icons';

/** Inline QR glyph (no dedicated icon export in the barrel). */
function QrGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75H16.5v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h3v3h-3v-3z"
      />
    </svg>
  );
}

/**
 * Подключить `/connect` — the hero connect flow (hi-fi §3).
 *
 * A brand re-spine over the SAME data layer as `Connection.tsx`: auto-detected
 * platform → install app → one-tap deep-link → QR sheet → soft success. The rich
 * per-app `InstallationGuide` is demoted into the «Другое устройство» disclosure,
 * unchanged. No new endpoints — reuses appConfig / connectionLink / openDeepLink.
 */
export default function ConnectPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const { isTelegramWebApp } = useTelegramSDK();
  const { impact: hapticImpact, notification: hapticNotify } = useHaptic();
  const notify = useNotify();

  const detected = useMemo<DetectedPlatform>(() => detectPlatform(), []);
  // One-tap deep-link (happ://) only resolves on mobile with the app installed.
  const isOneTapPlatform = detected === 'ios' || detected === 'android';
  const [platformOverride, setPlatformOverride] = useState<string | null>(detected);
  const activePlatform = platformOverride;

  const [showOther, setShowOther] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: appConfig, isLoading, error } = useQuery<AppConfig>({
    queryKey: ['appConfig'],
    queryFn: () => subscriptionApi.getAppConfig(),
  });
  const { data: connectionLink, isLoading: linkLoading } = useQuery({
    queryKey: ['connectionLink'],
    queryFn: () => subscriptionApi.getConnectionLink(),
    retry: false,
    staleTime: 0,
  });

  const qrConnectionUrl = useMemo(
    () =>
      resolveConnectionUrlForUi({
        mode: connectionLink?.connect_mode,
        happSchemeLink: connectionLink?.happ_scheme_link,
        displayLink: connectionLink?.display_link,
        subscriptionUrl: connectionLink?.subscription_url,
        happCryptLink: connectionLink?.happ_cryptolink,
        happCryptoLink: connectionLink?.happ_crypto_link,
        happLink: connectionLink?.happ_link,
        fallbackUrl: appConfig?.subscriptionUrl,
      }),
    [
      appConfig?.subscriptionUrl,
      connectionLink?.connect_mode,
      connectionLink?.display_link,
      connectionLink?.happ_cryptolink,
      connectionLink?.happ_crypto_link,
      connectionLink?.happ_link,
      connectionLink?.happ_scheme_link,
      connectionLink?.subscription_url,
    ],
  );

  const resolveUrl = useCallback(
    (url: string): string => {
      if (!hasTemplates(url) || !appConfig?.subscriptionUrl) return url;
      return resolveTemplate(url, {
        subscriptionUrl: appConfig.subscriptionUrl,
        username: user?.username ?? undefined,
      });
    },
    [appConfig?.subscriptionUrl, user?.username],
  );

  const openDeepLink = useCallback(
    (deepLink: string) => {
      let resolved = deepLink;
      if (isHappCryptolinkMode(connectionLink?.connect_mode) && qrConnectionUrl) {
        resolved = qrConnectionUrl;
      } else if (hasTemplates(resolved)) {
        resolved = resolveUrl(resolved);
      }
      const isHttpUrl = /^https?:\/\//i.test(resolved);
      const finalUrlForTelegram = isHttpUrl
        ? resolved
        : `${window.location.origin}/miniapp/redirect.html?url=${encodeURIComponent(resolved)}&lang=${i18n.language || 'en'}`;

      hapticImpact('medium');
      if (isTelegramWebApp) {
        try {
          sdkOpenLink(finalUrlForTelegram, { tryInstantView: false });
        } catch {
          window.location.href = resolved;
        }
      } else {
        window.location.href = resolved;
      }
      // Soft success — we can't observe the deep-link handshake, so we show the
      // proof-of-life prompt optimistically (hi-fi §3.5).
      setShowSuccess(true);
    },
    [
      isTelegramWebApp,
      i18n.language,
      resolveUrl,
      connectionLink?.connect_mode,
      qrConnectionUrl,
      hapticImpact,
    ],
  );

  // Re-show soft success if the user returns to the tab (came back from the app).
  useEffect(() => {
    if (!showSuccess) return;
    const onFocus = () => setShowSuccess(true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [showSuccess]);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!qrConnectionUrl) return;
    await copyToClipboard(qrConnectionUrl);
    setCopied(true);
    hapticNotify('success');
    notify.success(t('connect.link.copied'));
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [qrConnectionUrl, hapticNotify, notify, t]);

  // ── Featured app for the active platform (lead with Happ / first featured) ──
  const platformData = useMemo<RemnawavePlatformData | undefined>(() => {
    if (!appConfig?.platforms || !activePlatform) return undefined;
    return appConfig.platforms[activePlatform] as RemnawavePlatformData | undefined;
  }, [appConfig?.platforms, activePlatform]);

  const featuredApp = useMemo<RemnawaveAppClient | undefined>(() => {
    const apps = platformData?.apps;
    if (!apps?.length) return undefined;
    return apps.find((a) => a.featured) || apps[0];
  }, [platformData]);

  // The featured app's store/download URL — the first `external` button across
  // its blocks. This is the correct target for the «Установить» action (unlike
  // deepLink, which is the happ://add scheme for an already-installed app).
  const installUrl = useMemo<string | undefined>(() => {
    for (const block of featuredApp?.blocks ?? []) {
      for (const btn of block.buttons ?? []) {
        if (btn.type === 'external') {
          const u = btn.resolvedUrl || btn.url || btn.link;
          if (u) return u;
        }
      }
    }
    return undefined;
  }, [featuredApp]);

  const openExternalUrl = useCallback(
    (url: string) => {
      hapticImpact('light');
      if (isTelegramWebApp) {
        try {
          sdkOpenLink(url, { tryInstantView: false });
          return;
        } catch {
          /* fall through to a normal navigation */
        }
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [isTelegramWebApp, hapticImpact],
  );

  const hasApps = useMemo(() => {
    if (!appConfig?.platforms) return false;
    return Object.values(appConfig.platforms).some(
      (p: RemnawavePlatformData) => p.apps && p.apps.length > 0,
    );
  }, [appConfig?.platforms]);

  const availablePlatforms = useMemo<string[]>(() => {
    if (!appConfig?.platforms) return [];
    return Object.keys(appConfig.platforms).filter((k) => {
      const d = appConfig.platforms[k] as RemnawavePlatformData | undefined;
      return Boolean(d?.apps?.length);
    });
  }, [appConfig?.platforms]);

  // ── Loading ──
  if (isLoading || linkLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="skeleton mb-2 h-4 w-28 rounded" />
          <div className="skeleton h-8 w-56 rounded-lg" />
        </div>
        <div className="skeleton h-10 w-48 rounded-full" />
        <div className="skeleton h-36 w-full rounded-bento" />
        <div className="skeleton h-14 w-full rounded-full" />
      </div>
    );
  }

  // ── Not configured / no apps ──
  if (error || !appConfig || !hasApps) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-champagne-100">
          <SettingsIcon className="h-8 w-8 text-champagne-500" />
        </div>
        <h3 className="mb-2 font-display text-xl font-bold text-champagne-900 dark:text-dark-50">
          {t('subscription.connection.notConfigured')}
        </h3>
        <p className="mb-6 max-w-sm text-champagne-600 dark:text-dark-400">
          {isAdmin
            ? t('subscription.connection.notConfiguredAdmin')
            : t('subscription.connection.notConfiguredUser')}
        </p>
        {isAdmin && (
          <Link to="/admin/apps">
            <PillButton variant="dark" fullWidth={false} leadingIcon={<SettingsIcon className="h-4 w-4" />}>
              {t('subscription.connection.goToApps')}
            </PillButton>
          </Link>
        )}
      </div>
    );
  }

  // ── No subscription — gate the flow (hi-fi §3.6) ──
  if (!appConfig.hasSubscription) {
    return (
      <div className="space-y-5">
        {!isTelegramWebApp && <WebBackButton to="/" />}
        <Kicker>{t('connect.kicker')}</Kicker>
        <div className="rounded-4xl border border-champagne-300 bg-champagne-50 p-7 text-center dark:border-dark-700/40 dark:bg-dark-900/60">
          <p className="mb-5 text-[15px] text-champagne-700 dark:text-dark-300">
            {t('connect.noSubscription.title')}
          </p>
          <PillButton
            variant="primary"
            leadingIcon={<ArrowRightIcon className="h-5 w-5" />}
            onClick={() => navigate('/subscription/buy')}
          >
            {t('connect.noSubscription.button')}
          </PillButton>
        </div>
      </div>
    );
  }

  // ── Success / proof-of-life ──
  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center px-2 py-10 text-center">
        <AnimatedCheckmark className="mb-6" />
        <h1 className="mb-2 font-display text-2xl font-bold text-champagne-900 dark:text-dark-50">
          {t('connect.success.title')}
        </h1>
        <p className="mb-7 max-w-xs text-champagne-600 dark:text-dark-400">
          {t('connect.success.proof')}
        </p>
        <div className="w-full max-w-sm">
          <PillButton variant="primary" onClick={() => navigate('/')}>
            {t('connect.success.backHome')}
          </PillButton>
          <button
            type="button"
            onClick={() => setShowSuccess(false)}
            className="mt-3 w-full text-center text-[13px] font-medium text-champagne-500 hover:text-champagne-700"
          >
            {t('connect.success.retry')}
          </button>
        </div>
      </div>
    );
  }

  const detectedLabel = t(platformDetectKey(activePlatform));

  return (
    <div className="space-y-6">
      {!isTelegramWebApp && <WebBackButton to="/" />}

      {/* Header */}
      <div>
        <Kicker className="mb-2">{t('connect.kicker')}</Kicker>
        <h1 className="font-display text-2xl font-bold text-champagne-900 dark:text-dark-50">
          {t('connect.title')}
        </h1>
      </div>

      {/* Platform chip (auto-detected, editable) */}
      <div className="inline-flex items-center gap-2 rounded-full border border-champagne-300 bg-champagne-100 px-4 py-2 text-[14px] text-champagne-900 dark:border-dark-700/40 dark:bg-dark-800/60 dark:text-dark-50">
        <span className="text-champagne-600 dark:text-dark-400">{t('connect.device.prefix')}</span>
        <span className="font-medium">{detectedLabel}</span>
        <button
          type="button"
          onClick={() => setShowOther((v) => !v)}
          className="ml-1 inline-flex items-center gap-1 text-[13px] font-medium text-accent-600 hover:underline"
        >
          <PencilIcon className="h-3.5 w-3.5" />
          {t('connect.device.change')}
        </button>
      </div>

      {/* Step 1 — install app */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-md bg-champagne-200 px-1.5 py-0.5 font-mono text-[11px] text-champagne-700">
            1
          </span>
          <h2 className="text-[15px] font-semibold text-champagne-900 dark:text-dark-50">
            {t('connect.step1.title')}
          </h2>
        </div>
        <div className="rounded-bento border border-champagne-300 bg-champagne-50 p-4 dark:border-dark-700/40 dark:bg-dark-900/60">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-warning-400" aria-hidden="true" />
            <div>
              <div className="text-[15px] font-semibold text-champagne-900 dark:text-dark-50">
                {featuredApp?.name ?? 'Happ'}
              </div>
              <div className="text-[12px] text-champagne-600 dark:text-dark-400">
                {t('connect.step1.appHint')}
              </div>
            </div>
          </div>
          <PillButton
            variant="dark"
            leadingIcon={<DownloadIcon className="h-5 w-5" />}
            onClick={() => {
              // Install = open the app's store/download page (the external button
              // in its blocks). deepLink is the happ://add scheme — useless to a
              // user who hasn't installed the app yet. Fall back to the full guide.
              if (installUrl) {
                openExternalUrl(installUrl);
              } else {
                setShowOther(true);
              }
            }}
          >
            {t('connect.step1.installButton', { app: featuredApp?.name ?? 'Happ' })}
          </PillButton>
        </div>
      </section>

      {/* Step 2 — connect */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-md bg-champagne-200 px-1.5 py-0.5 font-mono text-[11px] text-champagne-700">
            2
          </span>
          <h2 className="text-[15px] font-semibold text-champagne-900 dark:text-dark-50">
            {t('connect.step2.title')}
          </h2>
        </div>

        {/* One-tap opens the Happ deep-link (happ://add/<sub>). The scheme only
            resolves on mobile where the app is installed; on desktop it falls
            through to the raw sub URL and just opens the JSON in the browser, so
            we hide it there and lead with QR / copy instead. */}
        {isOneTapPlatform && (
          <PillButton
            variant="primary"
            leadingIcon={<PowerIcon className="h-5 w-5" />}
            disabled={
              !featuredApp?.deepLink && !qrConnectionUrl && !connectionLink?.happ_scheme_link
            }
            onClick={() => {
              const link =
                featuredApp?.deepLink || connectionLink?.happ_scheme_link || qrConnectionUrl;
              if (link) openDeepLink(link);
            }}
          >
            {t('connect.oneTap.button')}
          </PillButton>
        )}

        <div className={cn('grid grid-cols-2 gap-2.5', isOneTapPlatform && 'mt-2.5')}>
          <PillButton
            variant="soft"
            leadingIcon={<QrGlyph className="h-5 w-5" />}
            disabled={!qrConnectionUrl}
            onClick={() => {
              hapticImpact('light');
              setQrOpen(true);
            }}
          >
            {t('connect.qr.show')}
          </PillButton>
          <PillButton
            variant="soft"
            leadingIcon={<CopyIcon className="h-5 w-5" />}
            disabled={!qrConnectionUrl}
            onClick={handleCopy}
          >
            {t('connect.link.copy')}
          </PillButton>
        </div>
      </section>

      {/* «Другое устройство» disclosure — the full InstallationGuide, unchanged */}
      <div className="border-t border-champagne-300 pt-4 dark:border-dark-700/40">
        <button
          type="button"
          onClick={() => setShowOther((v) => !v)}
          className="flex w-full items-center justify-between text-[14px] font-medium text-champagne-600 hover:text-champagne-900 dark:text-dark-400"
        >
          <span className="inline-flex items-center gap-2">
            <LinkIcon className="h-4 w-4" />
            {t('connect.other')}
          </span>
          <ChevronDownIcon
            className={`h-5 w-5 transition-transform ${showOther ? 'rotate-180' : ''}`}
          />
        </button>
        {showOther && (
          <div className="mt-4">
            <InstallationGuide
              appConfig={appConfig}
              onOpenDeepLink={openDeepLink}
              isTelegramWebApp={isTelegramWebApp}
              onGoBack={() => setShowOther(false)}
              onOpenQR={() => setQrOpen(true)}
            />
          </div>
        )}
      </div>

      {/* QR sheet */}
      <ConnectQRSheet
        open={qrOpen}
        url={qrConnectionUrl || ''}
        hideLink={connectionLink?.hide_link ?? appConfig?.hideLink ?? false}
        copied={copied}
        onCopy={handleCopy}
        onClose={() => setQrOpen(false)}
      />

      {/* Platform override is reflected via the «Другое устройство» grid below;
          the override state keeps the chip honest when the user switches there. */}
      {availablePlatforms.length > 1 && showOther && (
        <PlatformQuickSwitch
          platforms={availablePlatforms}
          active={activePlatform}
          onPick={setPlatformOverride}
        />
      )}
    </div>
  );
}

/** Tiny platform switch row surfaced inside the «Другое устройство» disclosure. */
function PlatformQuickSwitch({
  platforms,
  active,
  onPick,
}: {
  platforms: string[];
  active: string | null;
  onPick: (p: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {platforms.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
            p === active
              ? 'border-accent-500/40 bg-accent-500/12 text-accent-600'
              : 'border-champagne-300 bg-champagne-100 text-champagne-700 hover:bg-champagne-200'
          }`}
        >
          {t(platformDetectKey(p))}
        </button>
      ))}
    </div>
  );
}
