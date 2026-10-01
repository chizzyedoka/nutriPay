import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { env } from '../config.js';
import { prisma } from '../db.js';

const router = Router();

async function resolveUserId(metadataUserId: string | undefined, customerId: string | null) {
  if (metadataUserId) {
    const metadataUser = await prisma.user.findUnique({ where: { id: metadataUserId }, select: { id: true } });
    if (metadataUser) return metadataUser.id;
  }
  if (!customerId) return null;
  const customer = await stripeCustomerEmail(customerId);
  if (!customer) return null;
  const user = await prisma.user.findFirst({ where: { OR: [{ stripeCustomerId: customerId }, { email: customer }] }, select: { id: true } });
  return user?.id ?? null;
}

async function stripeCustomerEmail(customerId: string) {
  const customer = await new Stripe(env.STRIPE_SECRET_KEY).customers.retrieve(customerId);
  return customer.deleted ? null : customer.email?.toLowerCase() ?? null;
}

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
        const { userId: metadataUserId, mealId } = intent.metadata;
        const userId = await resolveUserId(metadataUserId, typeof intent.customer === 'string' ? intent.customer : null);
        const meal = mealId ? await transaction.meal.findUnique({ where: { id: mealId }, select: { id: true } }) : null;
        if (userId && meal) await transaction.premiumPurchase.upsert({ where: { paymentIntentId: intent.id }, update: {}, create: { userId, mealId: meal.id, paymentIntentId: intent.id, amountCents: intent.amount } });
        else console.warn(`Skipping payment entitlement for ${intent.id}: no matching user or meal in this database`);
      }
      if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(subscription.metadata.userId, typeof subscription.customer === 'string' ? subscription.customer : null);
        if (userId) await transaction.subscription.upsert({ where: { stripeSubscriptionId: subscription.id }, update: { status: subscription.status, cancelAtPeriodEnd: subscription.cancel_at_period_end }, create: { userId, stripeSubscriptionId: subscription.id, stripePriceId: subscription.items.data[0]?.price.id ?? env.STRIPE_MONTHLY_PRICE_ID, status: subscription.status, cancelAtPeriodEnd: subscription.cancel_at_period_end } });
      }
      await transaction.processedWebhookEvent.create({ data: { id: event.id, type: event.type } });
    });
    return response.json({ received: true });
  } catch (error) { return next(error); }
});

export default router;
