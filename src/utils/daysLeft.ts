/**
 * Начатые сутки остатка подписки — для крупного счётчика «N дней».
 *
 * API отдаёт остаток как целые сутки + часы + минуты (`days_left` = floor),
 * поэтому свежий триал на 3 дня сразу показывал «2 дня», а бот в тот же
 * момент — дату через 3 дня. Как и в боте (`days_left_rounded_up`), неполные
 * сутки считаются целыми: 2 д 23 ч → 3, 20 ч → 1, истекшая — 0.
 */
export function daysLeftRoundedUp(
  subscription:
    | { days_left?: number | null; hours_left?: number | null; minutes_left?: number | null }
    | null
    | undefined,
): number {
  if (!subscription) return 0;
  const days = Math.max(0, subscription.days_left ?? 0);
  const hasPartialDay = (subscription.hours_left ?? 0) > 0 || (subscription.minutes_left ?? 0) > 0;
  return hasPartialDay ? days + 1 : days;
}
