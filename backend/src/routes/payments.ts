import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../auth.js';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { getOrCreateCustomer, stripe } from '../services/stripe.js';
import { hasActiveSubscription } from '../services/entitlements.js';

const router = Router();
const mealIntentSchema = z.object({ mealId: z.string().min(1) });

router.post('/meal-intents', requireAuth, async (request: AuthenticatedRequest, response, next) => {
  try {
    const { mealId } = mealIntentSchema.parse(request.body);
    const [user, meal] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: request.userId } }),
      prisma.meal.findUnique({ where: { id: mealId } })
    ]);
    if (!meal) return response.status(404).json({ error: 'Meal not found' });
    if (await hasActiveSubscription(user.id)) return response.status(409).json({ error: 'Your active subscription already includes every meal', code: 'SUBSCRIPTION_INCLUDES_MEAL' });
    const existing = await prisma.premiumPurchase.findUnique({ where: { userId_mealId: { userId: user.id, mealId } } });
    if (existing) return response.status(409).json({ error: 'Meal is already unlocked' });
    const customerId = await getOrCreateCustomer(user);
    if (!user.stripeCustomerId) await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    const intent = await stripe.paymentIntents.create({ amount: meal.unlockPriceCents, currency: env.STRIPE_CURRENCY, customer: customerId, receipt_email: user.email, metadata: { userId: user.id, mealId: meal.id } });
    return response.json({ clientSecret: intent.client_secret, amountCents: meal.unlockPriceCents });
  } catch (error) { return next(error); }
});

router.post('/confirm', requireAuth, async (request: AuthenticatedRequest, response, next) => {
  try {
    const paymentIntentId = z.object({ paymentIntentId: z.string().startsWith('pi_') }).parse(request.body).paymentIntentId;
    const [user, intent] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: request.userId } }),
      stripe.paymentIntents.retrieve(paymentIntentId)
    ]);
    const customerMatches = typeof intent.customer === 'string' && intent.customer === user.stripeCustomerId;
    const metadataMatches = intent.metadata.userId === user.id;
    if (!customerMatches && !metadataMatches) return response.status(403).json({ error: 'Payment does not belong to this account' });
    if (intent.status !== 'succeeded') return response.status(409).json({ error: `Payment is ${intent.status}`, status: intent.status });
    const mealId = intent.metadata.mealId;
    const meal = mealId ? await prisma.meal.findUnique({ where: { id: mealId } }) : null;
    if (!meal) return response.status(404).json({ error: 'Paid meal was not found' });
    await prisma.premiumPurchase.upsert({ where: { paymentIntentId: intent.id }, update: {}, create: { userId: user.id, mealId: meal.id, paymentIntentId: intent.id, amountCents: intent.amount } });
    return response.json({ confirmed: true, mealId: meal.id });
  } catch (error) { return next(error); }
});

export default router;
