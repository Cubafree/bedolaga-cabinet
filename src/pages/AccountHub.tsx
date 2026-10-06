import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '../store/auth';
import { useTheme } from '../hooks/useTheme';
import { useDestructiveConfirm } from '../platform/hooks/useNativeDialog';
import { subscriptionApi } from '../api/subscription';

import { Kicker } from '@/components/ui/Kicker';
import { PillButton } from '@/components/ui/PillButton';
import {
  ChevronRightIcon,
  DevicesIcon,
  LinkIcon,
  UserPlusIcon,
  GiftIcon,
  PowerIcon,
} from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';

const LANGS: { code: string; label: string }[] = [
  { code: 'ru', label: 'РУС' },
  { code: 'en', label: 'EN' },
  { code: 'zh', label: '中文' },
  { code: 'fa', label: 'فارسی' },
];

const cardClass =
  'rounded-bento border border-champagne-300 bg-champagne-50 dark:border-dark-800 dark:bg-dark-900';
const pillClass = (active: boolean) =>
  `rounded-full px-3 py-1 text-sm font-medium transition-colors ${
    active
      ? 'bg-accent-500 text-white'
      : 'bg-champagne-100 text-champagne-800 dark:bg-dark-800 dark:text-dark-200'
  }`;

/** Muted mono eyebrow that heads a group of rows (squint-test structure). */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 mt-6 px-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-champagne-500 dark:text-dark-400">
      {children}
    </div>
  );
}

/** A single tappable navigation row inside a grouped card. */
function NavRow({
  icon,
  label,
  onClick,
  first,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  first?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-champagne-100 dark:hover:bg-dark-800/60 ${
        first ? '' : 'border-t border-champagne-200 dark:border-dark-800'
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-champagne-100 text-champagne-700 dark:bg-dark-800 dark:text-dark-200">
        {icon}
      </span>
      <span className="flex-1 font-medium text-champagne-900 dark:text-dark-50">{label}</span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-champagne-500 dark:text-dark-400" />
    </button>
  );
}

export default function AccountHub() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { theme, setTheme, canToggle } = useTheme();
  const confirmLogout = useDestructiveConfirm();

  // Device count powers the actionable «Мои устройства» card. Best-effort:
  // if there is no subscription (or the call fails) we treat the count as
  // unknown and fall back to the plain nav row → /subscription.
  const { data: devicesData, isLoading: devicesLoading } = useQuery({
    queryKey: ['account-devices'],
    queryFn: () => subscriptionApi.getDevices(),
    retry: false,
    staleTime: 60_000,
  });
  const deviceCount = devicesData?.total;

  // Identity: a real name wins; otherwise fall back to the email so the hero
  // line is always meaningful, and only show the literal placeholder when we
  // have neither. Never render the field label («Имя») as its own value.
  const nameRaw = user?.first_name?.trim() || '';
  const email = user?.email || '';
  const displayName = nameRaw || email || t('account.profile.namePlaceholder');
  // Secondary email line is only useful when the hero line is the name.
  const showEmail = Boolean(nameRaw) && Boolean(email);
  const avatarInitial = (nameRaw || email || '?').charAt(0).toUpperCase();

  const handleLogout = async () => {
    const ok = await confirmLogout(
      t('account.logout.confirmText'),
      t('account.logout.confirmOk'),
      t('account.logout.confirmTitle'),
    );
    if (ok) {
      logout();
      navigate('/login');
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
      <Kicker>{t('account.kicker')}</Kicker>

      {/* ── Профиль ── prominent identity (hero) */}
      <SectionLabel>{t('account.sections.profile')}</SectionLabel>
      <section className={`p-5 ${cardClass}`}>
        <div className="flex items-center gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-500/12 font-display text-2xl font-bold text-accent-600"
            aria-hidden="true"
          >
            {avatarInitial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-xl font-bold text-champagne-900 dark:text-dark-50">
              {displayName}
            </div>
            {showEmail && (
              <div className="mt-0.5 truncate text-sm text-champagne-700 dark:text-dark-300">
                {email}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-champagne-100 px-3 py-2 dark:bg-dark-800/60">
          <span className="text-xs text-champagne-600 dark:text-dark-400">
            {t('account.profile.id')}
          </span>
          <span className="font-mono text-xs text-champagne-800 dark:text-dark-200">
            {user?.id}
          </span>
        </div>
        <p className="mt-1.5 px-1 text-xs text-champagne-600 dark:text-dark-400">
          {t('account.profile.idHint')}
        </p>
      </section>

      {/* ── Устройства ── actionable count / connect CTA */}
      {deviceCount === 0 ? (
        <section className={`mt-4 p-5 ${cardClass}`}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-champagne-100 text-champagne-700 dark:bg-dark-800 dark:text-dark-200">
              <DevicesIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-champagne-900 dark:text-dark-50">
                {t('account.devices.title')}
              </div>
              <div className="mt-0.5 text-[13px] text-champagne-600 dark:text-dark-400">
                {t('account.devices.emptyHint')}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <PillButton
              variant="soft"
              leadingIcon={<PowerIcon className="h-5 w-5" />}
              onClick={() => navigate('/connect')}
            >
              {t('account.devices.connectCta')}
            </PillButton>
          </div>
        </section>
      ) : (
        <section className={`mt-4 overflow-hidden ${cardClass}`}>
          <button
            onClick={() => navigate('/subscription')}
            className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-champagne-100 dark:hover:bg-dark-800/60"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-champagne-100 text-champagne-700 dark:bg-dark-800 dark:text-dark-200">
              <DevicesIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-champagne-900 dark:text-dark-50">
                {t('account.devices.title')}
              </div>
              {devicesLoading ? (
                <Skeleton className="mt-1 h-3 w-24 rounded" />
              ) : deviceCount !== undefined ? (
                <div className="mt-0.5 text-[13px] text-champagne-600 dark:text-dark-400">
                  {t('account.devices.connected', { n: deviceCount })}
                </div>
              ) : (
                <div className="mt-0.5 text-[13px] text-champagne-600 dark:text-dark-400">
                  {t('account.devices.subtitle')}
                </div>
              )}
            </div>
            <ChevronRightIcon className="h-5 w-5 shrink-0 text-champagne-500 dark:text-dark-400" />
          </button>
        </section>
      )}

      {/* ── Прочее ── grouped account actions */}
      <SectionLabel>{t('account.sections.more')}</SectionLabel>
      <section className={`overflow-hidden ${cardClass}`}>
        <NavRow
          first
          icon={<LinkIcon className="h-4 w-4" />}
          label={t('account.linked.title')}
          onClick={() => navigate('/profile/accounts')}
        />
        <NavRow
          icon={<UserPlusIcon className="h-4 w-4" />}
          label={t('account.referral.title')}
          onClick={() => navigate('/referral')}
        />
        <NavRow
          icon={<GiftIcon className="h-4 w-4" />}
          label={t('account.gift.title')}
          onClick={() => navigate('/gift')}
        />
      </section>

      {/* ── Настройки ── */}
      <SectionLabel>{t('account.settings.title')}</SectionLabel>
      <section className={`p-5 ${cardClass}`}>
        <div>
          <div className="text-xs text-champagne-600 dark:text-dark-400">
            {t('account.settings.language')}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => i18n.changeLanguage(l.code)}
                className={pillClass(Boolean(i18n.language?.startsWith(l.code)))}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {canToggle && (
          <div className="mt-4">
            <div className="text-xs text-champagne-600 dark:text-dark-400">
              {t('account.settings.theme')}
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setTheme('light')} className={pillClass(theme === 'light')}>
                {t('account.settings.themeLight')}
              </button>
              <button onClick={() => setTheme('dark')} className={pillClass(theme === 'dark')}>
                {t('account.settings.themeDark')}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Logout */}
      <div className="mt-6">
        <PillButton variant="ghost" fullWidth onClick={handleLogout}>
          {t('account.logout.button')}
        </PillButton>
      </div>
    </div>
  );
}
