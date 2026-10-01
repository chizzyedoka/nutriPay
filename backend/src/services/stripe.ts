import Stripe from 'stripe';
import { env } from '../config.js';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY);

export async function getOrCreateCustomer(user: { id: string; email: string; stripeCustomerId: string | null }) {
  if (user.stripeCustomerId) {
    await stripe.customers.update(user.stripeCustomerId, { email: user.email });
    return user.stripeCustomerId;
  }
  const customer = await stripe.customers.create({ email: user.email, metadata: { userId: user.id } });
  return customer.id;
}
