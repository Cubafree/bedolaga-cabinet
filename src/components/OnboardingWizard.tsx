import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { PillButton } from '@/components/ui/PillButton';
import { ShieldIcon, PlayIcon, GiftIcon } from '@/components/icons';
import { safeLocal } from '@/utils/safeStorage';

const STORAGE_KEY = 'onboarding_wizard_seen';

/**
 * useOnboardingWizard — localStorage-gated first-login gate for the value-first
 * 3-card wizard. Independent of the spotlight tour (`onboarding_completed`) so
 * the two never collide.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useOnboardingWizard() {
  const [isSeen, setIsSeen] = useState(() => safeLocal.getItem(STORAGE_KEY) === 'true');

  const markSeen = useCallback(() => {
    safeLocal.setItem(STORAGE_KEY, 'true');
    setIsSeen(true);
  }, []);

  return { isSeen, markSeen };
}

interface OnboardingWizardProps {
  /** Start the free trial («3 дня бесплатно, без карты»). */
  onTrial: () => void;
  /** Go to plan selection / purchase. */
  onBuy: () => void;
  /** Dismiss without acting (also fired after trial/buy). */
  onClose: () => void;
}

const SLIDES = [
  { key: '1', Icon: ShieldIcon },
  { key: '2', Icon: PlayIcon },
  { key: '3', Icon: GiftIcon },
] as const;

export default function OnboardingWizard({ onTrial, onBuy, onClose }: OnboardingWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  const total = SLIDES.length;
  const isLast = step === total - 1;
  const slide = SLIDES[step];

  const next = () => setStep((s) => Math.min(s + 1, total - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-champagne-900/40 p-4 backdrop-blur-sm sm:items-center dark:bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboard-wizard-title"
        className="w-full max-w-md rounded-bento border border-champagne-300 bg-champagne-50 p-6 shadow-xl dark:border-dark-800 dark:bg-dark-900"
      >
        {/* Skip-all */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-champagne-600 transition-colors hover:text-champagne-900 dark:text-dark-400 dark:hover:text-dark-100"
          >
            {t('onboard.skipAll')}
          </button>
        </div>

        {/* Icon */}
        <div className="mt-2 flex justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-600">
            <slide.Icon className="h-8 w-8" />
          </span>
        </div>

        {/* Copy */}
        <h2
          id="onboard-wizard-title"
          className="mt-5 text-center font-display text-xl font-bold text-champagne-900 dark:text-dark-50"
        >
          {t(`onboard.${slide.key}.title`)}
        </h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-champagne-700 dark:text-dark-300">
          {t(`onboard.${slide.key}.text`)}
        </p>

        {/* Progress dots */}
        <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden="true">
          {SLIDES.map((s, idx) => (
            <span
              key={s.key}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === step ? 'w-6 bg-accent-500' : 'w-1.5 bg-champagne-300 dark:bg-dark-700'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-2">
          {isLast ? (
            <>
              <PillButton
                variant="primary"
                onClick={() => {
                  onClose();
                  onTrial();
                }}
              >
                {t('onboard.3.cta.trial')}
              </PillButton>
              <PillButton
                variant="soft"
                onClick={() => {
                  onClose();
                  onBuy();
                }}
              >
                {t('onboard.3.cta.buy')}
              </PillButton>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-sm text-champagne-600 transition-colors hover:text-champagne-900 dark:text-dark-400 dark:hover:text-dark-100"
              >
                {t('onboard.3.skip')}
              </button>
            </>
          ) : (
            <PillButton variant="primary" onClick={next}>
              {t('onboard.next')}
            </PillButton>
          )}

          {step > 0 && !isLast && (
            <button
              type="button"
              onClick={back}
              className="w-full py-2 text-sm text-champagne-600 transition-colors hover:text-champagne-900 dark:text-dark-400 dark:hover:text-dark-100"
            >
              {t('onboard.back')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
