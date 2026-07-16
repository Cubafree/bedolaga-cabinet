import i18next from 'i18next';

/**
 * Russian day plural: «1 день / 2–4 дня / 5+ дней» (with the 11–14 exception).
 *
 * Reads the `plural.days.{one,few,many}` strings from i18n (copy spec E1.3 §6),
 * each containing a `{{count}}` placeholder, so non-RU locales can override the
 * forms later. Falls back to a bare number if keys are missing.
 */
export function pluralizeDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const tens = abs % 10;

  let form: 'one' | 'few' | 'many';
  if (abs > 10 && abs < 20) form = 'many';
  else if (tens === 1) form = 'one';
  else if (tens >= 2 && tens <= 4) form = 'few';
  else form = 'many';

  const key = `plural.days.${form}`;
  const translated = i18next.t(key, { n, defaultValue: '' });
  if (translated && translated !== key) return translated;

  // Fallback (RU forms) if the bundle hasn't loaded the keys.
  const word = form === 'one' ? 'день' : form === 'few' ? 'дня' : 'дней';
  return `${n} ${word}`;
}
