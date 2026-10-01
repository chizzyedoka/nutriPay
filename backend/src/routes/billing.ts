import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth.js';
import { env } from '../config.js';
import { prisma } from '../db.js';
import { getOrCreateCustomer, stripe } from '../services/stripe.js';

const router = Router();

router.post('/subscription-intent', requireAuth, async (request: AuthenticatedRequest, response, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId } });
    const existing = await prisma.subscription.findFirst({ where: { userId: user.id, status: { in: ['active', 'trialing', 'incomplete'] } } });
    if (existing) return response.status(409).json({ error: 'A subscription already exists', status: existing.status });
    const customerId = await getOrCreateCustomer(user);
    if (!user.stripeCustomerId) await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    const subscription = await stripe.subscriptions.create({ customer: customerId, items: [{ price: env.STRIPE_MONTHLY_PRICE_ID }], payment_behavior: 'default_incomplete', payment_settings: { save_default_payment_method: 'on_subscription' }, expand: ['latest_invoice.payment_intent', 'latest_invoice.confirmation_secret'], metadata: { userId: user.id } });
    const invoice = subscription.latest_invoice;
    const paymentIntent = typeof invoice === 'object' && invoice && 'payment_intent' in invoice ? invoice.payment_intent : null;
    const paymentIntentSecret = paymentIntent && typeof paymentIntent === 'object' && 'client_secret' in paymentIntent ? paymentIntent.client_secret : null;
    const confirmationSecret = typeof invoice === 'object' && invoice && 'confirmation_secret' in invoice ? invoice.confirmation_secret : null;
    const clientSecret = paymentIntentSecret ?? (confirmationSecret && typeof confirmationSecret === 'object' ? confirmationSecret.client_secret : null);
    if (!clientSecret) return response.status(502).json({ error: 'Stripe did not return a subscription payment client secret' });
    return response.json({ clientSecret, subscriptionId: subscription.id, status: subscription.status });
  } catch (error) { return next(error); }
});

router.post('/confirm', requireAuth, async (request: AuthenticatedRequest, response, next) => {
  try {
    const subscriptionId = request.body?.subscriptionId;
    if (typeof subscriptionId !== 'string' || !subscriptionId.startsWith('sub_')) return response.status(400).json({ error: 'Invalid subscription ID' });
    const [user, subscription] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: request.userId } }),
      stripe.subscriptions.retrieve(subscriptionId)
    ]);
    const customerMatches = typeof subscription.customer === 'string' && subscription.customer === user.stripeCustomerId;
    const metadataMatches = subscription.metadata.userId === user.id;
    if (!customerMatches && !metadataMatches) return response.status(403).json({ error: 'Subscription does not belong to this account' });
    if (!['active', 'trialing'].includes(subscription.status)) return response.status(409).json({ error: `Subscription is ${subscription.status}`, status: subscription.status });
    const saved = await prisma.subscription.upsert({
      where: { stripeSubscriptionId: subscription.id },
      update: { status: subscription.status, cancelAtPeriodEnd: subscription.cancel_at_period_end },
      create: { userId: user.id, stripeSubscriptionId: subscription.id, stripePriceId: subscription.items.data[0]?.price.id ?? env.STRIPE_MONTHLY_PRICE_ID, status: subscription.status, cancelAtPeriodEnd: subscription.cancel_at_period_end }
    });
    return response.json({ confirmed: true, subscription: saved });
  } catch (error) { return next(error); }
});

router.get('/status', requireAuth, async (request: AuthenticatedRequest, response, next) => {
  try { return response.json({ subscription: await prisma.subscription.findFirst({ where: { userId: request.userId }, orderBy: { createdAt: 'desc' } }) }); }
  catch (error) { return next(error); }
});

router.post('/cancel', requireAuth, async (request: AuthenticatedRequest, response, next) => {
  try {
    const subscription = await prisma.subscription.findFirst({ where: { userId: request.userId, status: { in: ['active', 'trialing'] } } });
    if (!subscription) return response.status(404).json({ error: 'No active subscription found' });
    const updated = await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
    await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: true } });
    return response.json({ status: updated.status, cancelAtPeriodEnd: updated.cancel_at_period_end });
  } catch (error) { return next(error); }
});

export default router;
