import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

import { useAuthStore } from '@/store/auth';
import { useHaptic } from '@/platform';
import { useTelegramSDK } from '@/hooks/useTelegramSDK';
import { useHeaderHeight } from '@/hooks/useHeaderHeight';
import { useTheme } from '@/hooks/useTheme';
import { useBranding } from '@/hooks/useBranding';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import { themeColorsApi } from '@/api/themeColors';
import { isLogoPreloaded } from '@/api/branding';
import { cn } from '@/lib/utils';

import WebSocketNotifications from '@/components/WebSocketNotifications';
import CampaignBonusNotifier from '@/components/CampaignBonusNotifier';
import SuccessNotificationModal from '@/components/SuccessNotificationModal';
import { PromptDialogHost } from '@/components/PromptDialogHost';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import TicketNotificationBell from '@/components/TicketNotificationBell';
import {
  SubscriptionIcon,
  HomeIcon,
  PowerIcon,
  RocketIcon,
  ChatIcon,
  UserIcon,
  ShieldIcon,
  LogoutIcon,
  SunIcon,
  MoonIcon,
} from '@/components/icons';

import { MobileBottomNav } from './MobileBottomNav';
import { AppHeader } from './AppHeader';
import { BackgroundRenderer } from '@/components/backgrounds/BackgroundRenderer';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const logout = useAuthStore((state) => state.logout);
  const { isFullscreen, safeAreaInset, contentSafeAreaInset, platform, isMobile } =
    useTelegramSDK();
  const { mobile: headerHeight } = useHeaderHeight();
  const haptic = useHaptic();
  const { toggleTheme, isDark } = useTheme();

  // Extracted hooks
  const { appName, hasCustomLogo, logoUrl } = useBranding();
  const { referralEnabled, wheelEnabled, hasContests, hasPolls, giftEnabled } = useFeatureFlags();
  useScrollRestoration();

  // Theme toggle visibility
  const { data: enabledThemes } = useQuery({
    queryKey: ['enabled-themes'],
    queryFn: themeColorsApi.getEnabledThemes,
    staleTime: 1000 * 60 * 5,
  });
  const canToggleTheme = enabledThemes?.dark && enabledThemes?.light;

  // Only apply fullscreen UI adjustments on mobile Telegram (iOS/Android)
  const isMobileFullscreen = isFullscreen && isMobile;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Reset keyboard state on route change — prevents bottom nav staying hidden after navigation
  useEffect(() => {
    setIsKeyboardOpen(false);
  }, [location.pathname]);

  // Keyboard detection for hiding bottom nav
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (
        !relatedTarget ||
        (relatedTarget.tagName !== 'INPUT' &&
          relatedTarget.tagName !== 'TEXTAREA' &&
          !relatedTarget.isContentEditable)
      ) {
        setIsKeyboardOpen(false);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Desktop navigation — fixed 5-tab spine (mirrors the mobile bottom bar).
  // Wheel/Referral/Gift/Info no longer eat nav slots (IA §1.3 / feature matrix HIDE).
  const desktopNav = [
    { path: '/', label: t('nav.home'), icon: HomeIcon },
    { path: '/connect', label: t('nav.connect'), icon: PowerIcon },
    { path: '/subscription', label: t('nav.subscription'), icon: SubscriptionIcon },
    { path: '/help', label: t('nav.help'), icon: ChatIcon },
    { path: '/account', label: t('nav.account'), icon: UserIcon },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Admin entry hidden from cabinet UI — admins reach /admin by direct URL.
  const ADMIN_NAV_VISIBLE = false;
  // Animated background disabled (distracting); component kept for easy re-enable.
  const BACKGROUND_ENABLED = false;

  const handleNavClick = () => {
    haptic.impact('light');
  };

  // A single elegant nav link: icon + label always visible, with a shared
  // framer-motion pill that slides to the active item on navigation.
  const renderNavLink = (
    path: string,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    admin = false,
  ) => {
    const active = admin ? location.pathname.startsWith('/admin') : isActive(path);
    return (
      <Link
        key={path}
        to={path}
        onClick={handleNavClick}
        aria-label={label}
        className={cn(
          'relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors duration-200',
          active
            ? admin
              ? 'text-warning-300'
              : 'text-champagne-900 dark:text-dark-50'
            : admin
              ? 'text-warning-500/70 hover:bg-warning-500/10 hover:text-warning-300'
              : 'text-champagne-600 hover:bg-champagne-100 hover:text-champagne-900 dark:text-dark-400 dark:hover:bg-dark-800/60 dark:hover:text-dark-100',
        )}
      >
        {active && (
          <motion.span
            layoutId="desktop-nav-active"
            className={cn(
              // Подсветка-пилюля активного пункта — «приподнята» над треком капсулы
              'absolute inset-0 rounded-full shadow-sm',
              admin
                ? 'bg-warning-500/15 ring-1 ring-warning-500/20'
                : 'bg-champagne-50 ring-1 ring-champagne-300 dark:bg-dark-700/80 dark:ring-dark-600/40',
            )}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}
        <Icon className="relative h-4 w-4 shrink-0" />
        <span className="relative whitespace-nowrap">{label}</span>
      </Link>
    );
  };

  // headerHeight comes from useHeaderHeight() — accounts for TG safe area in fullscreen

  return (
    <div className="min-h-viewport">
      {/* Animated background renders via portal on document.body at z-index: -1 */}
      {BACKGROUND_ENABLED && <BackgroundRenderer />}

      {/* Global components */}
      <WebSocketNotifications />
      <CampaignBonusNotifier />
      <SuccessNotificationModal />
      <PromptDialogHost />

      {/* Desktop Header */}
      <header className="fixed left-0 right-0 top-0 z-50 hidden border-b border-champagne-300 bg-champagne-50 dark:border-dark-800/50 dark:bg-dark-950/95 lg:block">
        {/* 3-зонный grid: лого | капсула | действия. Колонки 1fr_auto_1fr держат
            капсулу строго по центру вьюпорта НЕЗАВИСИМО от ширины лого/действий,
            а действия — у правого края. Поэтому ничего не «скачет» при переходах
            (в т.ч. в админку): смена ширины в одной зоне не двигает другие. */}
        <div className="mx-auto grid h-14 max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-6">
          {/* Logo */}
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2.5 justify-self-start"
            onClick={handleNavClick}
          >
            {/* Brand mark — RocketIcon in an accent square (hi-fi §1.3). The
                custom-logo override path is preserved: a configured logo still wins. */}
            <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent-500 text-white">
              {hasCustomLogo && logoUrl ? (
                <img
                  src={logoUrl}
                  alt={appName || 'Logo'}
                  className={cn(
                    'absolute h-full w-full object-contain transition-opacity duration-200',
                    isLogoPreloaded() ? 'opacity-100' : 'opacity-0',
                  )}
                />
              ) : (
                <RocketIcon className="h-5 w-5" />
              )}
            </div>
            <span className="text-base font-semibold text-champagne-900 dark:text-dark-100">
              {appName}
            </span>
          </Link>

          {/* Navigation — единая «капсула» (segmented control): все пункты видны
              всегда, без скролла/сжатия/сворачивания. Центрируется средней
              колонкой grid (justify-self-center), а не auto-margin'ами. */}
          <nav className="flex items-center gap-0.5 justify-self-center rounded-full border border-champagne-300 bg-champagne-100/50 p-1 shadow-sm backdrop-blur-sm dark:border-dark-800/70 dark:bg-dark-900/50">
            {desktopNav.map((item) => renderNavLink(item.path, item.label, item.icon))}
            {ADMIN_NAV_VISIBLE && isAdmin && (
              <>
                <div className="mx-1 h-5 w-px shrink-0 bg-champagne-300 dark:bg-dark-700/60" />
                {renderNavLink('/admin', t('admin.nav.title'), ShieldIcon, true)}
              </>
            )}
          </nav>

          {/* Right side actions — правая колонка grid, прижата к краю, не сжимается */}
          <div className="flex shrink-0 items-center gap-2 justify-self-end">
            <button
              onClick={() => {
                haptic.impact('light');
                toggleTheme();
              }}
              className={cn(
                'rounded-xl border border-dark-700/50 bg-dark-800/50 p-2 text-dark-400 transition-colors duration-200 hover:bg-dark-700 hover:text-accent-400',
                !canToggleTheme && 'hidden',
              )}
              aria-label={
                isDark ? t('theme.light') || 'Light mode' : t('theme.dark') || 'Dark mode'
              }
              title={isDark ? t('theme.light') || 'Light mode' : t('theme.dark') || 'Dark mode'}
            >
              {isDark ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
            </button>
            <TicketNotificationBell isAdmin={location.pathname.startsWith('/admin')} />
            <LanguageSwitcher />
            <button
              onClick={() => {
                haptic.impact('light');
                logout();
              }}
              className="rounded-xl border border-dark-700/50 bg-dark-800/50 p-2 text-dark-400 transition-colors duration-200 hover:bg-dark-700 hover:text-accent-400"
              title={t('nav.logout')}
            >
              <LogoutIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <AppHeader
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onCommandPaletteOpen={() => {}}
        headerHeight={headerHeight}
        isFullscreen={isMobileFullscreen}
        safeAreaInset={safeAreaInset}
        contentSafeAreaInset={contentSafeAreaInset}
        telegramPlatform={platform}
        wheelEnabled={wheelEnabled}
        referralEnabled={referralEnabled}
        hasContests={hasContests}
        hasPolls={hasPolls}
        giftEnabled={giftEnabled}
      />

      {/* Desktop spacer */}
      <div className="hidden h-14 lg:block" />

      {/* Mobile spacer */}
      <div className="lg:hidden" style={{ height: headerHeight }} />

      {/* Main content */}
      {/* Bottom padding must clear the fixed MobileBottomNav (A1): the bar floats
          16px above the safe area (bottom: 16px + safe-area) and is ~74px tall, so
          the flow content it overlays needs 16 + ~74 + a breathing gap + safe-area.
          pb-28 (112px) was a flat value that ignored env(safe-area-inset-bottom),
          so on notched phones (~34px) the last row clipped. Use an arbitrary value
          that adds the safe-area inset on top of the nav footprint; lg has no bottom
          nav, so lg:pb-8 still wins there. */}
      <main className="mx-auto max-w-6xl px-4 py-6 pb-[calc(120px+env(safe-area-inset-bottom,0px))] lg:px-6 lg:pb-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation — fixed 5-tab spine */}
      <MobileBottomNav isKeyboardOpen={isKeyboardOpen} />
    </div>
  );
}
