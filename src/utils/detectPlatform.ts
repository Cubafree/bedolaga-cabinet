/**
 * User-agent platform detection — shared by the Подключить flow.
 *
 * Mirrors the private `detectPlatform()` inside
 * `components/connection/InstallationGuide.tsx` (kept there to avoid touching
 * that file's diff). Returns a Remnawave platform key or null when unknown.
 */
export type DetectedPlatform =
  | 'ios'
  | 'android'
  | 'macos'
  | 'windows'
  | 'linux'
  | 'androidTV'
  | null;

export function detectPlatform(): DetectedPlatform {
  if (typeof window === 'undefined' || !navigator?.userAgent) return null;
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return /tv|television/.test(ua) ? 'androidTV' : 'android';
  if (/macintosh|mac os x/.test(ua)) return 'macos';
  if (/windows/.test(ua)) return 'windows';
  if (/linux/.test(ua)) return 'linux';
  return null;
}

/** i18n key suffix for the human label of a detected platform (connect.detect.*). */
export function platformDetectKey(platform: DetectedPlatform | string | null): string {
  switch (platform) {
    case 'ios':
      return 'connect.detect.ios';
    case 'macos':
      return 'connect.detect.macos';
    case 'android':
      return 'connect.detect.android';
    case 'windows':
      return 'connect.detect.windows';
    case 'linux':
      return 'connect.detect.linux';
    case 'androidTV':
      return 'connect.detect.tv';
    default:
      return 'connect.detect.unknown';
  }
}
