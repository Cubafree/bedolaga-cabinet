import i18next from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import en from '../locales/en.json';
import ru from '../locales/ru.json';
import { pluralizeDays } from './pluralizeDays';

describe('pluralizeDays', () => {
  beforeAll(async () => {
    await i18next.init({
      lng: 'ru',
      fallbackLng: 'ru',
      resources: { ru: { translation: ru }, en: { translation: en } },
    });
  });

  it('uses Russian plural rules for ru', async () => {
    await i18next.changeLanguage('ru');
    expect([1, 2, 5, 11, 21, 22, 25].map(pluralizeDays)).toEqual([
      '1 день',
      '2 дня',
      '5 дней',
      '11 дней',
      '21 день',
      '22 дня',
      '25 дней',
    ]);
  });

  it('uses English plural rules for en', async () => {
    await i18next.changeLanguage('en');
    expect([0, 1, 2, 21].map(pluralizeDays)).toEqual(['0 days', '1 day', '2 days', '21 days']);
  });
});
