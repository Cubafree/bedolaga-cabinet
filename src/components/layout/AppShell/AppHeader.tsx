import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

import { useAuthStore } from '@/store/auth';
import { displayName } from '@/utils/displayName';
import { useShallow } from 'zustand/shallow';
import { useTheme } from '@/hooks/useTheme';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { usePlatform } from '@/platform';
import {
  brandingApi,
  getCachedBranding,
  setCachedBranding,
  preloadLogo,
  isLogoPreloaded,
} from '@/api/branding';
import { themeColorsApi } from '@/api/themeColors';
import { cn } from '@/lib/utils';

import LanguageSwitcher from '@/components/LanguageSwitcher';
import TicketNotificationBell from '@/components/TicketNotificationBell';
import { LogoutButton } from './LogoutButton';

// Icons
import {
  HomeIcon,
  PowerIcon,
  SubscriptionIcon,
  ChatIcon,
  UserIcon,
  CogIcon,
  MenuIcon,
  CloseIcon,
  SunIcon,
  MoonIcon,
  SearchIcon,
  RocketIcon,
} from './icons';

// Brand default when VITE_APP_NAME is unset — the RocketJump brand, never the
// generic word "Cabinet" (A2). appName still comes from useBranding()/branding.
const FALLBACK_NAME = import.meta.env.VITE_APP_NAME || 'RocketJump';

import type { TelegramPlatform } from '@/hooks/useTelegramSDK';

interface AppHeaderProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  onCommandPaletteOpen: () => void;
  /** CSS-длина шапки (учитывает safe-area) — сдвиг оверлея меню. */
  headerHeight: string;
  isFullscreen: boolean;
  safeAreaInset: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset: { top: number; bottom: number; left: number; right: number };
  telegramPlatform?: TelegramPlatform;
  wheelEnabled?: boolean;
  referralEnabled?: boolean;
  hasContests?: boolean;
  hasPolls?: boolean;
  giftEnabled?: boolean;
}

export function AppHeader({
  mobileMenuOpen,
  setMobileMenuOpen,
  onCommandPaletteOpen,
  headerHeight,
  isFullscreen,
  safeAreaInset,
  contentSafeAreaInset,
  telegramPlatform,
}: AppHeaderProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuthStore(
    useShallow((state) => ({ user: state.user, logout: state.logout, isAdmin: state.isAdmin })),
  );
  const { toggleTheme, isDark } = useTheme();
  const { haptic, platform } = usePlatform();
  const avatar = useUserAvatar(user);
  const [logoLoaded, setLogoLoaded] = useState(() => isLogoPreloaded());

  // Branding
  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: async () => {
      const data = await brandingApi.getBranding();
      setCachedBranding(data);
      await preloadLogo(data);
      return data;
    },
    initialData: getCachedBranding() ?? undefined,
    initialDataUpdatedAt: 0,
    staleTime: 60000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // Fall back to the brand default when branding.name is empty/undefined (A2) —
  // never render an empty header or the generic "Cabinet".
  const appName = branding?.name || FALLBACK_NAME;
  const hasCustomLogo = branding?.has_custom_logo || false;
  const logoUrl = branding ? brandingApi.getLogoUrl(branding) : null;

  // Theme toggle visibility
  const { data: enabledThemes } = useQuery({
    queryKey: ['enabled-themes'],
    queryFn: themeColorsApi.getEnabledThemes,
    staleTime: 1000 * 60 * 5,
  });
  const canToggle = enabledThemes?.dark && enabledThemes?.light;

  // Lock scroll when menu is open (works in iframe/Telegram Mini App)
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const preventDefault = (e: TouchEvent) => {
      // Allow scrolling inside menu content
      const target = e.target as HTMLElement;
      if (target.closest('.mobile-menu-content')) return;
      e.preventDefault();
    };

    document.addEventListener('touchmove', preventDefault, { passive: false });
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('touchmove', preventDefault);
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };
  // Admin entry hidden from cabinet UI — admins reach /admin by direct URL.
  const ADMIN_NAV_VISIBLE = false;
  const isAdminActive = () => location.pathname.startsWith('/admin');

  // Mobile drawer mirrors the fixed 5-tab spine. HIDE features (Wheel/Contests/
  // Polls) must not appear on ANY nav surface (IA §1.2), so they are gone here too.
  const navItems = [
    { path: '/', label: t('nav.home'), icon: HomeIcon },
    { path: '/connect', label: t('nav.connect'), icon: PowerIcon },
    { path: '/subscription', label: t('nav.subscription'), icon: SubscriptionIcon },
    { path: '/help', label: t('nav.help'), icon: ChatIcon },
    { path: '/account', label: t('nav.account'), icon: UserIcon },
  ];

  return (
    <>
      {/* Header - only on mobile. В standalone-режиме iOS («На экран Домой»)
          шапка продолжается под статус-бар через padding-top; тон для этого
          режима задаёт .app-mobile-header в globals.css (display-mode: standalone),
          чтобы не было ни отдельного светлого блока, ни жёсткой границы. */}
      <header
        className="glass app-mobile-header fixed left-0 right-0 top-0 z-50 shadow-lg shadow-black/10 lg:hidden"
        style={{
          paddingTop: isFullscreen
            ? `${Math.max(safeAreaInset.top, contentSafeAreaInset.top) + (telegramPlatform === 'android' ? 48 : 45)}px`
            : 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div
          // Боковые отступы не меньше вырезов: в альбомной ориентации iPhone
          // env(safe-area-inset-left/right) — это чёлка и скруглённые углы.
          className="mx-auto w-full pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]"
          onClick={() => mobileMenuOpen && setMobileMenuOpen(false)}
        >
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="flex flex-shrink-0 items-center gap-2.5"
            >
              {/* Brand mark — RocketIcon in an accent square, matching the desktop
                  header (AppShell). The custom-logo override still wins: a configured
                  logo renders in place of the rocket (A2). */}
              <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-linear-lg bg-accent-500 text-white shadow-md">
                {hasCustomLogo && logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={appName || 'Logo'}
                    className={cn(
                      'absolute h-full w-full object-contain transition-opacity duration-200',
                      logoLoaded ? 'opacity-100' : 'opacity-0',
                    )}
                    onLoad={() => setLogoLoaded(true)}
                  />
                ) : (
                  <RocketIcon className="h-6 w-6" />
                )}
              </div>
              <span className="whitespace-nowrap text-base font-semibold text-champagne-900 dark:text-dark-100">
                {appName}
              </span>
            </Link>

            {/* Right side */}
            <div className="flex items-center gap-1.5">
              {/* Command palette trigger (web only) */}
              {platform !== 'telegram' && (
                <button
                  onClick={() => {
                    haptic.impact('light');
                    onCommandPaletteOpen();
                  }}
                  className="btn-icon hidden sm:flex"
                  title="Search (⌘K)"
                >
                  <SearchIcon className="h-5 w-5" />
                </button>
              )}

              {/* Theme toggle */}
              {canToggle && (
                <button
                  onClick={() => {
                    haptic.impact('light');
                    toggleTheme();
                    setMobileMenuOpen(false);
                  }}
                  className="relative rounded-linear-lg border border-dark-700/50 bg-dark-800/50 p-2 text-dark-400 transition-all duration-200 hover:bg-dark-700 hover:text-accent-400"
                  title={isDark ? t('theme.light') || 'Light mode' : t('theme.dark') || 'Dark mode'}
                >
                  <div className="relative h-5 w-5">
                    <div
                      className={cn(
                        'absolute inset-0 transition-all duration-300',
                        isDark ? 'rotate-0 opacity-100' : 'rotate-90 opacity-0',
                      )}
                    >
                      <MoonIcon className="h-5 w-5" />
                    </div>
                    <div
                      className={cn(
                        'absolute inset-0 transition-all duration-300',
                        isDark ? '-rotate-90 opacity-0' : 'rotate-0 opacity-100',
                      )}
                    >
                      <SunIcon className="h-5 w-5" />
                    </div>
                  </div>
                </button>
              )}

              <div onClick={() => setMobileMenuOpen(false)}>
                <TicketNotificationBell isAdmin={isAdminActive()} />
              </div>
              <div onClick={() => setMobileMenuOpen(false)}>
                <LanguageSwitcher />
              </div>

              {/* Mobile menu button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  haptic.impact('light');
                  setMobileMenuOpen(!mobileMenuOpen);
                }}
                className={`rounded-xl p-2.5 transition-all duration-200 ${
                  mobileMenuOpen
                    ? 'bg-dark-700 text-dark-100'
                    : 'text-dark-400 hover:bg-dark-800 hover:text-dark-100'
                }`}
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <CloseIcon className="h-6 w-6" />
                ) : (
                  <MenuIcon className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 animate-fade-in lg:hidden"
          style={{ top: headerHeight }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-dark-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Menu content */}
          <div
            className="mobile-menu-content absolute inset-x-0 bottom-0 top-0 overflow-y-auto overscroll-contain border-t border-dark-800/50 bg-dark-900/95 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="mx-auto max-w-6xl py-4 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]">
              {/* User info */}
              <div className="mb-4 flex items-center justify-between border-b border-dark-800/50 pb-4">
                {/* min-w-0 — иначе truncate у имени не срабатывал, и длинное имя
                    уходило за правый край экрана. */}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {/* Заглушка — через состояние, а не правкой DOM: прежний onError прятал
                      картинку руками, и любой ре-рендер возвращал класс hidden заглушке,
                      оставляя пустое место. */}
                  {avatar.src ? (
                    <img
                      src={avatar.src}
                      alt="Avatar"
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                      onError={avatar.onError}
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dark-700">
                      <UserIcon className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-dark-100">
                      {displayName(user)}
                    </div>
                    <div className="truncate text-xs text-dark-500">
                      @{user?.username || `ID: ${user?.telegram_id}`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Nav items */}
              <nav className="space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={isActive(item.path) ? 'nav-item-active' : 'nav-item'}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                ))}

                {ADMIN_NAV_VISIBLE && isAdmin && (
                  <>
                    <div className="divider my-3" />
                    <div className="px-4 py-1 text-xs font-medium uppercase tracking-wider text-dark-500">
                      {t('admin.nav.title')}
                    </div>
                    <Link
                      to="/admin"
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'nav-item',
                        isAdminActive() ? 'bg-warning-500/10 text-warning-400' : 'text-warning-500',
                      )}
                    >
                      <CogIcon className="h-5 w-5" />
                      {t('admin.nav.title')}
                    </Link>
                  </>
                )}

                <div className="divider my-3" />

                <Link
                  to="/account"
                  onClick={() => setMobileMenuOpen(false)}
                  className={isActive('/account') ? 'nav-item-active' : 'nav-item'}
                >
                  <UserIcon className="h-5 w-5" />
                  {t('nav.account')}
                </Link>

                <LogoutButton
                  variant="menu"
                  onLogout={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                />
              </nav>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
