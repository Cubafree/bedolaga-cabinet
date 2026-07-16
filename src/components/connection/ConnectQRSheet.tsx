import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

import { PillButton } from '@/components/ui/PillButton';
import { CopyIcon, CheckIcon, CloseIcon } from '@/components/icons';

interface ConnectQRSheetProps {
  open: boolean;
  url: string;
  /** Whether to print the raw link under the QR (false = privacy-masked). */
  hideLink?: boolean;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}

/**
 * QR sub-flow as a bottom sheet over /connect (hi-fi §3.4, IA §2a).
 * Self-contained (no external Sheet primitive dependency): backdrop + spring
 * drawer. On desktop the same content is presented centered via CSS.
 *
 * Copy label is exactly «Скопировать ссылку для подключения» — never «конфиг»/«URL».
 */
export default function ConnectQRSheet({
  open,
  url,
  hideLink = false,
  copied,
  onCopy,
  onClose,
}: ConnectQRSheetProps) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label={t('action.close')}
            onClick={onClose}
            className="absolute inset-0 bg-champagne-900/40 backdrop-blur-sm"
          />

          {/* Drawer */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('connect.qr.title')}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="relative w-full max-w-md rounded-t-4xl border border-champagne-300 bg-champagne-50 p-6 pb-8 shadow-xl sm:rounded-4xl dark:border-dark-700/40 dark:bg-dark-900"
          >
            {/* Drag handle */}
            <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-champagne-300 sm:hidden" />

            <button
              type="button"
              onClick={onClose}
              aria-label={t('action.close')}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-champagne-500 hover:bg-champagne-100"
            >
              <CloseIcon className="h-5 w-5" />
            </button>

            <h3 className="mb-1 text-center font-display text-lg font-bold text-champagne-900 dark:text-dark-50">
              {t('connect.qr.title')}
            </h3>

            <div className="my-5 flex justify-center">
              <div className="rounded-bento bg-white p-5">
                <QRCodeSVG value={url} size={224} level="M" includeMargin={false} />
              </div>
            </div>

            <p className="mb-5 text-center text-sm text-champagne-600 dark:text-dark-400">
              {t('connect.qr.subtitle')}
            </p>

            {!hideLink && (
              <p className="mb-5 truncate text-center font-mono text-xs text-champagne-500">{url}</p>
            )}

            <PillButton
              variant="soft"
              leadingIcon={copied ? <CheckIcon className="h-5 w-5" /> : <CopyIcon className="h-5 w-5" />}
              onClick={onCopy}
            >
              {copied ? t('connect.link.copied') : t('connect.link.copy')}
            </PillButton>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
