import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { env } from '../config.js';
import { prisma } from '../db.js';

const router = Router();

router.post('/', async (request, response, next) => {
  let event: Stripe.Event;
  try { event = Stripe.webhooks.constructEvent(request.body, request.header('stripe-signature') ?? '', env.STRIPE_WEBHOOK_SECRET); }
  catch { return response.status(400).json({ error: 'Invalid Stripe signature' }); }
  try {
    const alreadyProcessed = await prisma.processedWebhookEvent.findUnique({ where: { id: event.id } });
    if (alreadyProcessed) return response.json({ received: true, duplicate: true });
    await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      if (event.type === 'payment_intent.succeeded') {
        const intent = event.data.object as Stripe.PaymentIntent;
        const { userId, mealId } = intent.metadata;
        if (userId && mealId) await transaction.premiumPurchase.upsert({ where: { paymentIntentId: intent.id }, update: {}, create: { userId, mealId, paymentIntentId: intent.id, amountCents: intent.amount } });
      }
      if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata.userId;
        if (userId) await transaction.subscription.upsert({ where: { stripeSubscriptionId: subscription.id }, update: { status: subscription.status, cancelAtPeriodEnd: subscription.cancel_at_period_end }, create: { userId, stripeSubscriptionId: subscription.id, stripePriceId: subscription.items.data[0]?.price.id ?? env.STRIPE_MONTHLY_PRICE_ID, status: subscription.status, cancelAtPeriodEnd: subscription.cancel_at_period_end } });
      }
      await transaction.processedWebhookEvent.create({ data: { id: event.id, type: event.type } });
    });
    return response.json({ received: true });
  } catch (error) { return next(error); }
});

export default router;
