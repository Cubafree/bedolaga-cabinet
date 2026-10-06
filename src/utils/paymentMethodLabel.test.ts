import { describe, expect, it } from 'vitest';
import { buildPaymentMethodDisplay } from './paymentMethodLabel';

const m = (id: string, name: string, description: string | null = null) => ({
  id,
  name,
  description,
});

describe('buildPaymentMethodDisplay', () => {
  it('keeps the generic label when a type is offered once', () => {
    const display = buildPaymentMethodDisplay([
      m('yookassa', 'YooKassa'),
      m('cryptobot', 'CryptoBot'),
    ]);
    expect(display.get('yookassa')?.label).not.toBe('YooKassa');
    expect(display.get('cryptobot')?.label).not.toBe('CryptoBot');
  });

  it('falls back to the operator name when several methods share a type', () => {
    const display = buildPaymentMethodDisplay([
      m('yookassa', 'Карта (быстро)'),
      m('platega', 'Карта (запасной)'),
    ]);
    expect(display.get('yookassa')?.label).toBe('Карта (быстро)');
    expect(display.get('platega')?.label).toBe('Карта (запасной)');
  });

  it('prefers the operator description over the generic hint', () => {
    const display = buildPaymentMethodDisplay([m('cashera', 'Cashera', 'Без комиссии')]);
    expect(display.get('cashera')?.hint).toBe('Без комиссии');
  });
});
