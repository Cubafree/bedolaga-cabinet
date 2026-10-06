import i18next from 'i18next';

/**
 * Localized day count: «1 день / 2 дня / 5 дней», "1 day / 21 days".
 *
 * Uses i18next count plurals on `plural.days` (`_one/_few/_many` in ru,
 * `_one/_other` in en), so each locale applies its own plural rules
 * (copy spec E1.3 §6). Falls back to RU forms if the bundle hasn't loaded the keys.
 */
export function pluralizeDays(n: number): string {
  const key = 'plural.days';
  const translated = i18next.t(key, { count: n, defaultValue: '' });
  if (translated && translated !== key) return translated;

  const form = new Intl.PluralRules('ru').select(n);
  const word = form === 'one' ? 'день' : form === 'few' ? 'дня' : 'дней';
  return `${n} ${word}`;
}
