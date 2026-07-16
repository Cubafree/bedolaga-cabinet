import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

import { cn } from '@/lib/utils';
import { usePlatform } from '@/platform';

// Icons — fixed 5-tab spine (P0 connect slice, hi-fi §1.1).
import { HomeIcon, PowerIcon, SubscriptionIcon, ChatIcon, UserIcon } from './icons';

interface MobileBottomNavProps {
  isKeyboardOpen: boolean;
}

/**
 * Mobile bottom tab bar — fixed 5-tab spine:
 *   Главная · Подключить · Подписка · Помощь · Аккаунт
 *
 * Replaces the old dynamic Wheel/Referral/Balance slot juggling (IA §1.4 ADR:
 * a predictable bar is the whole point for the non-technical audience). Hidden
 * features never appear here. Restyled to the RocketJump champagne brand.
 */
export function MobileBottomNav({ isKeyboardOpen }: MobileBottomNavProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { haptic } = usePlatform();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  // Focused checkout: hide the tab bar on the purchase screen so the sticky
  // pay bar owns the bottom edge (NOTES_purchase_redesign §3, owner decision 2).
  const hideOnCheckout = location.pathname.startsWith('/subscription/buy');
  if (hideOnCheckout) return null;

  const items = [
    { path: '/', label: t('nav.home'), icon: HomeIcon },
    { path: '/connect', label: t('nav.connect'), icon: PowerIcon },
    { path: '/subscription', label: t('nav.subscription'), icon: SubscriptionIcon },
    { path: '/help', label: t('nav.help'), icon: ChatIcon },
    { path: '/account', label: t('nav.account'), icon: UserIcon },
  ];

  const handleNavClick = () => {
    haptic.impact('light');
  };

  return (
    <nav
      className={cn(
        'fixed z-50 transition-all duration-200 lg:hidden',
        // Light brand surface; dark theme keeps a dark glass via the .light variant fallback.
        'border border-champagne-300 bg-champagne-50/95 backdrop-blur-md',
        'dark:border-dark-700/30 dark:bg-dark-900/95',
        isKeyboardOpen ? 'pointer-events-none opacity-0' : 'opacity-100',
      )}
      style={{
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left: '16px',
        right: '16px',
        borderRadius: 'var(--bento-radius, 24px)',
        padding: '8px 4px',
        boxShadow: '0 4px 30px rgba(14, 27, 44, 0.12)',
      }}
    >
      <div className="flex justify-around">
        {items.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={handleNavClick}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-w-[56px] flex-1 shrink-0 flex-col items-center justify-center rounded-2xl px-2 py-2.5 transition-all duration-200 active:scale-[0.97]',
                active
                  ? 'text-accent-500'
                  : 'text-champagne-500 hover:text-champagne-700 dark:text-dark-500 dark:hover:text-dark-300',
              )}
            >
              {active && (
                <motion.div
                  layoutId="bottom-nav-active"
                  className="absolute inset-0 rounded-2xl bg-accent-500/12"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <item.icon className="relative z-10 h-5 w-5" />
              <span className="relative z-10 mt-1 whitespace-nowrap text-[10px] font-medium">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
