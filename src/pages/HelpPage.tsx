import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { infoApi } from '../api/info';
import { usePlatform } from '@/platform';

import { Kicker } from '@/components/ui/Kicker';
import { PillButton } from '@/components/ui/PillButton';
import { ChevronDownIcon, ChatIcon } from '@/components/icons';

/** Shared card recipe — matches AccountHub / SubscriptionDetail. */
const cardClass =
  'rounded-bento border border-champagne-300 bg-champagne-50 dark:border-dark-800 dark:bg-dark-900';

type PlatformKey = 'ios' | 'android' | 'windows' | 'tv';

const PLATFORMS: { key: PlatformKey; steps: string[]; action?: string }[] = [
  { key: 'ios', steps: ['1', '2', '3', '4'], action: 'button' },
  { key: 'android', steps: ['1', '2', '3', '4'], action: 'button' },
  { key: 'windows', steps: ['1', '2', '3', '4'], action: 'button' },
  { key: 'tv', steps: ['1', '2', '3', '4'], action: 'showQr' },
];

// FAQ order: connection / problems → payment → devices → cancel → second-row.
const FAQ_KEYS = [
  'whatIsVpn',
  'isSafe',
  'notWorking',
  'slow',
  'howToPay',
  'howManyDevices',
  'changeCountry',
  'howToCancel',
  'noEmail',
  'whatIsTraffic',
  'isLegal',
  'refundExpired',
] as const;

export default function HelpPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openTelegramLink, openLink } = usePlatform();

  const [openPlatform, setOpenPlatform] = useState<PlatformKey | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const { data: supportConfig } = useQuery({
    queryKey: ['support-config'],
    queryFn: infoApi.getSupportConfig,
  });

  // Reuse the existing support contact mechanism (see Support.tsx): if tickets
  // are enabled, route to the full ticket flow; otherwise open the configured
  // Telegram profile or external URL directly.
  const handleSupport = () => {
    if (!supportConfig || supportConfig.tickets_enabled) {
      navigate('/support');
      return;
    }
    if (supportConfig.support_type === 'url' && supportConfig.support_url) {
      openLink(supportConfig.support_url, { tryInstantView: false });
      return;
    }
    const username = (supportConfig.support_username || '@support').replace(/^@/, '');
    openTelegramLink(`https://t.me/${username}`);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
      <Kicker>{t('help.title')}</Kicker>
      <h1 className="mt-2 font-display text-2xl font-bold text-champagne-900 dark:text-dark-50">
        {t('help.title')}
      </h1>
      <p className="mt-1 text-sm text-champagne-700 dark:text-dark-300">{t('help.subtitle')}</p>

      {/* Как подключиться — platform cards (tap → expand steps) */}
      <section className="mt-6">
        <div className="font-display text-lg font-bold text-champagne-900 dark:text-dark-50">
          {t('help.connect.title')}
        </div>
        <p className="mt-1 text-sm text-champagne-700 dark:text-dark-300">
          {t('help.connect.subtitle')}
        </p>

        <div className="mt-4 space-y-3">
          {PLATFORMS.map((p) => {
            const isOpen = openPlatform === p.key;
            return (
              <div key={p.key} className={`overflow-hidden ${cardClass}`}>
                <button
                  type="button"
                  onClick={() => setOpenPlatform(isOpen ? null : p.key)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-champagne-100 dark:hover:bg-dark-800/60"
                >
                  <span className="font-medium text-champagne-900 dark:text-dark-50">
                    {t(`help.connect.platform.${p.key}`)}
                  </span>
                  <ChevronDownIcon
                    className={`h-5 w-5 shrink-0 text-champagne-500 transition-transform dark:text-dark-400 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-champagne-200 px-4 pb-4 pt-3 dark:border-dark-800">
                    <ol className="space-y-3">
                      {p.steps.map((s, idx) => (
                        <li key={s} className="flex gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-500/10 font-mono text-[13px] font-semibold text-accent-600">
                            {idx + 1}
                          </span>
                          <span className="pt-0.5 text-sm text-champagne-800 dark:text-dark-200">
                            {t(`help.steps.${p.key}.${s}`)}
                          </span>
                        </li>
                      ))}
                    </ol>

                    <div className="mt-3 rounded-xl bg-champagne-100 px-3 py-2 text-[13px] text-champagne-700 dark:bg-dark-800/60 dark:text-dark-300">
                      {t(`help.steps.${p.key}.check`)}
                    </div>

                    <div className="mt-4">
                      <PillButton variant="primary" onClick={() => navigate('/connect')}>
                        {t('help.connect.openFlow')}
                      </PillButton>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ accordion (single-open) */}
      <section className="mt-8">
        <div className="font-display text-lg font-bold text-champagne-900 dark:text-dark-50">
          {t('help.faq.title')}
        </div>

        <div className="mt-4 space-y-2">
          {FAQ_KEYS.map((key) => {
            const isOpen = openFaq === key;
            return (
              <div key={key} className={`overflow-hidden ${cardClass}`}>
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : key)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-champagne-100 dark:hover:bg-dark-800/60"
                >
                  <span className="font-medium text-champagne-900 dark:text-dark-50">
                    {t(`help.faq.${key}.q`)}
                  </span>
                  <ChevronDownIcon
                    className={`h-5 w-5 shrink-0 text-champagne-500 transition-transform dark:text-dark-400 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-champagne-200 px-4 pb-4 pt-3 text-sm leading-relaxed text-champagne-800 dark:border-dark-800 dark:text-dark-200">
                    {t(`help.faq.${key}.a`)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Напишите нам — support entry (reuses Support route/flow) */}
      <section className={`mt-8 p-5 ${cardClass}`}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/10 text-accent-600">
            <ChatIcon className="h-5 w-5" />
          </span>
          <div>
            <div className="font-display text-base font-bold text-champagne-900 dark:text-dark-50">
              {t('help.support.title')}
            </div>
            <p className="mt-1 text-sm text-champagne-700 dark:text-dark-300">
              {t('help.support.text')}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <PillButton variant="primary" onClick={handleSupport}>
            {t('help.support.button')}
          </PillButton>
        </div>
        <p className="mt-3 text-center text-xs text-champagne-600 dark:text-dark-400">
          {t('help.support.hours')}
        </p>
      </section>
    </div>
  );
}
