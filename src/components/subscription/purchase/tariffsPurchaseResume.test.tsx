// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformProvider } from '@/platform/PlatformProvider';
import type { PurchaseOptions, Tariff, TariffPeriod } from '@/types';
import { savePurchaseCart } from '@/utils/purchaseCartStorage';

/**
 * Возврат с пополнения восстанавливает ровно тот заказ, под который пополняли.
 *
 * Регрессия: смена восстановленного тарифа перезапускала эффекты «выгодный
 * период по умолчанию» и «сброс трафика», и пользователь, пополнивший баланс
 * под месяц, видел внизу годовой итог без докупленного трафика.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'ru', changeLanguage: () => Promise.resolve() },
  }),
  Trans: ({ children }: { children?: unknown }) => children ?? null,
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@/api/promo', () => ({
  promoApi: { getActiveDiscount: () => Promise.resolve(null) },
}));

vi.mock('@/api/currency', () => ({
  currencyApi: { getExchangeRates: () => Promise.resolve({ USD: 100, CNY: 14, IRR: 0.0024 }) },
}));

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const period = (days: number, price: number, label: string, discount = 0): TariffPeriod =>
  ({
    days,
    label,
    months: Math.round(days / 30),
    price_kopeks: price,
    original_price_kopeks: discount ? Math.round(price / (1 - discount / 100)) : undefined,
    discount_percent: discount,
    price_per_month_kopeks: 30000,
    is_highlighted: false,
  }) as unknown as TariffPeriod;

const tariff = (id: number, name: string): Tariff =>
  ({
    id,
    name,
    traffic_limit_label: '100 ГБ',
    device_limit: 1,
    is_daily: false,
    daily_price_kopeks: 0,
    custom_traffic_enabled: true,
    traffic_price_per_gb_kopeks: 100,
    min_traffic_gb: 10,
    max_traffic_gb: 500,
    periods: [period(30, 30000, '1 месяц'), period(360, 240000, '12 месяцев', 33)],
  }) as unknown as Tariff;

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('покупка тарифа: возврат с пополнения', () => {
  it('восстанавливает тариф, период и трафик сохранённого заказа', async () => {
    savePurchaseCart({
      mode: 'tariff',
      tariffId: 2,
      periodDays: 30,
      trafficGb: 100,
      totalKopeks: 40000,
    });
    const { TariffsPurchasePanel } = await import('./TariffsPurchasePanel');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <PlatformProvider>
          <MemoryRouter>
            <TariffsPurchasePanel
              tariffs={[tariff(1, 'Базовый'), tariff(2, 'Семейный')]}
              subscription={null}
              subscriptionId={undefined}
              balanceKopeks={1_000_000}
              isMultiTariff={false}
              isResume
              purchaseOptions={{ balance_kopeks: 1_000_000 } as unknown as PurchaseOptions}
              topUpHref="/subscription/balance/top-up?returnTo=%2Fsubscription%2Fbuy"
            />
          </MemoryRouter>
        </PlatformProvider>
      </QueryClientProvider>,
    );

    const pressed = (label: string) =>
      screen.getByText(label).closest('button')?.getAttribute('aria-pressed');
    expect(pressed('Семейный')).toBe('true');
    expect(pressed('1 месяц')).toBe('true');
    expect(pressed('12 месяцев')).toBe('false');
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('100');
  });
});
