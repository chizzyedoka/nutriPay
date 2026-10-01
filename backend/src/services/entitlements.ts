import { prisma } from '../db.js';

const activeSubscriptionStatuses = new Set(['active', 'trialing']);

export function isSubscriptionEntitled(status: string) {
  return activeSubscriptionStatuses.has(status);
}

export async function hasActiveSubscription(userId: string) {
  const subscription = await prisma.subscription.findFirst({ where: { userId, status: { in: [...activeSubscriptionStatuses] } } });
  return Boolean(subscription);
}

export async function hasMealEntitlement(userId: string, mealId: string) {
  const [purchase, subscription] = await Promise.all([
    prisma.premiumPurchase.findUnique({ where: { userId_mealId: { userId, mealId } } }),
    prisma.subscription.findFirst({ where: { userId, status: { in: [...activeSubscriptionStatuses] } } })
  ]);
  return Boolean(purchase || (subscription && isSubscriptionEntitled(subscription.status)));
}
