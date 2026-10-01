import { describe, expect, it } from 'vitest';
import { isSubscriptionEntitled } from './entitlements.js';

describe('subscription entitlements', () => {
  it('unlocks premium nutrition for active and trialing subscriptions', () => {
    expect(isSubscriptionEntitled('active')).toBe(true);
    expect(isSubscriptionEntitled('trialing')).toBe(true);
  });

  it('does not unlock premium nutrition for incomplete or canceled subscriptions', () => {
    expect(isSubscriptionEntitled('incomplete')).toBe(false);
    expect(isSubscriptionEntitled('canceled')).toBe(false);
    expect(isSubscriptionEntitled('past_due')).toBe(false);
  });
});