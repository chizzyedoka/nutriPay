import { useEffect, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { api } from './lib/api';

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) : null;
type CheckoutMode = { type: 'meal'; mealId: string; label: string; amountCents: number } | { type: 'subscription'; label: string };

function PaymentForm({ mode, onDone }: { mode: CheckoutMode; onDone: (message: string, paymentIntentId?: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');
    const mealQuery = mode.type === 'meal' ? `&meal_id=${encodeURIComponent(mode.mealId)}` : '';
    const returnUrl = `${window.location.origin}${window.location.pathname}?payment_type=${mode.type}${mealQuery}`;
    const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl }, redirect: 'if_required' });
    if (result.error) setError(result.error.message ?? 'Payment could not be completed');
    else if (result.paymentIntent?.status === 'succeeded') {
      setPaymentIntentId(result.paymentIntent.id);
      setSuccess(true);
    }
    else setError('Payment is processing. Keep this window open while Stripe confirms it.');
    setSubmitting(false);
  }

  if (success) return <div className="payment-success" role="status"><div className="success-mark">✓</div><h3>Payment successful</h3><p>Your {mode.type === 'subscription' ? '$20/month membership' : 'meal unlock'} is confirmed. Stripe will email your receipt if receipt emails are enabled for this account.</p><button className="dark-button" onClick={() => onDone('Payment successful. Your premium access is being updated.', paymentIntentId)}>Continue <span>↗</span></button></div>;

  return <form className="checkout-form" onSubmit={submit}>
    <PaymentElement />
    {error && <p className="notice">{error}</p>}
    <button className="dark-button" disabled={submitting || !stripe}>{submitting ? 'Processing...' : `Pay ${mode.type === 'subscription' ? '$20 / month' : `$${(mode.amountCents / 100).toFixed(2)}`}`} <span>↗</span></button>
  </form>;
}

export default function Checkout({ mode, onClose, onDone }: { mode: CheckoutMode; onClose: () => void; onDone: (message: string, paymentIntentId?: string) => void }) {
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const endpoint = mode.type === 'meal' ? '/payments/meal-intents' : '/billing/subscription-intent';
    const body = mode.type === 'meal' ? { mealId: mode.mealId } : undefined;
    api<{ clientSecret: string }>(endpoint, { method: 'POST', body }).then((data) => {
      if (!data.clientSecret) throw new Error('Stripe did not return a payment client secret');
      setClientSecret(data.clientSecret);
    }).catch((requestError: Error) => setError(requestError.message));
  }, [mode]);

  return <div className="checkout-backdrop" role="dialog" aria-modal="true" aria-label={`${mode.label} checkout`}><section className="checkout-panel"><button className="close-button" onClick={onClose} aria-label="Close checkout">×</button><p className="eyebrow">Secure checkout</p><h2>{mode.label}</h2><p className="checkout-copy">Your card details go directly to Stripe. NutriPay never stores payment information.</p>{error ? <p className="notice">{error}. Sign in first, then try again.</p> : clientSecret && stripePromise ? <Elements stripe={stripePromise} options={{ clientSecret }}><PaymentForm mode={mode} onDone={onDone} /></Elements> : <p className="muted">Preparing secure payment...</p>}</section></div>;
}
