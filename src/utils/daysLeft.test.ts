import { describe, expect, it } from 'vitest';
import { daysLeftRoundedUp } from './daysLeft';

describe('daysLeftRoundedUp', () => {
  it('fresh 3-day trial shows 3, not 2', () => {
    expect(daysLeftRoundedUp({ days_left: 2, hours_left: 23, minutes_left: 59 })).toBe(3);
  });

  it('less than a day still counts as 1', () => {
    expect(daysLeftRoundedUp({ days_left: 0, hours_left: 20, minutes_left: 0 })).toBe(1);
    expect(daysLeftRoundedUp({ days_left: 0, hours_left: 0, minutes_left: 5 })).toBe(1);
  });

  it('whole days stay as they are', () => {
    expect(daysLeftRoundedUp({ days_left: 30, hours_left: 0, minutes_left: 0 })).toBe(30);
  });

  it('expired or missing subscription is 0', () => {
    expect(daysLeftRoundedUp({ days_left: 0, hours_left: 0, minutes_left: 0 })).toBe(0);
    expect(daysLeftRoundedUp(null)).toBe(0);
    expect(daysLeftRoundedUp({})).toBe(0);
  });
});
