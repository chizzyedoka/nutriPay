import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import Checkout from './Checkout';
import { api, type Meal } from './lib/api';

type CheckoutMode = { type: 'meal'; mealId: string; label: string; amountCents: number } | { type: 'subscription'; label: string };

export default function MembershipPage() {
  const navigate = useNavigate();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [checkout, setCheckout] = useState<CheckoutMode | null>(null);
  const [fullMeal, setFullMeal] = useState<Meal | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [hasAllAccess, setHasAllAccess] = useState(false);

  useEffect(() => {
    api<Meal[]>('/meals').then(setMeals).catch((error: Error) => setNotice(error.message)).finally(() => setLoading(false));
    api<{ subscription: { status: string } | null }>('/billing/status').then(({ subscription }) => setHasAllAccess(subscription?.status === 'active' || subscription?.status === 'trialing')).catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clientSecret = params.get('payment_intent_client_secret');
    const returnedMealId = params.get('meal_id');
    if (!clientSecret || !import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) return;
    loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY).then((stripe) => stripe?.retrievePaymentIntent(clientSecret)).then((result) => {
      const status = result?.paymentIntent?.status;
      if (status === 'succeeded') {
        setNotice('Payment successful. Your premium access is being updated.');
        if (returnedMealId) loadFullMeal(returnedMealId);
      } else if (status === 'processing') setNotice('Payment is processing. Your premium access will appear after Stripe confirms it.');
      else setNotice('Payment was not completed. Please try again.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }).catch(() => setNotice('We could not verify the payment result. Check your Stripe dashboard before trying again.'));
  }, []);

  function loadFullMeal(mealId: string) {
    setDetailsLoading(true);
    let attempts = 0;
    const poll = () => api<Meal>(`/meals/${mealId}`).then((meal) => {
      if (!meal.isLocked || attempts >= 7) { setFullMeal(meal); setDetailsLoading(false); return; }
      attempts += 1;
      window.setTimeout(poll, 750);
    }).catch(() => setDetailsLoading(false));
    poll();
  }

  async function openMeal(meal: Meal) {
    try {
      const details = await api<Meal>(`/meals/${meal.id}`);
      if (!details.isLocked) { setFullMeal(details); return; }
    } catch {
      setNotice('Sign in before opening a meal checkout.');
      return;
    }
    if (hasAllAccess) {
      setNotice('Your active membership already includes this meal.');
      return;
    }
    setCheckout({ type: 'meal', mealId: meal.id, label: meal.name, amountCents: meal.unlockPriceCents });
  }

  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">n</span><span>nutri<span className="accent">pay</span></span></div><button className="text-link nav-button" onClick={() => navigate('/')}>Sign out <span aria-hidden="true">↗</span></button></header>
    <section className="hero"><div className="hero-copy"><p className="eyebrow">The weekly table</p><h1>Eat with<br /><em>certainty.</em></h1><p className="hero-text">Clear portions. Honest nutrition. A calmer way to make your next meal work harder for you.</p><a className="primary-button" href="#meals">Explore meals <span>↓</span></a></div><div className="hero-orbit" aria-label="Daily nutrition summary"><div className="orbit-ring" /><div className="orbit-card"><span>today's focus</span><strong>balanced<br />energy</strong><small>Carbs · 42% &nbsp; Protein · 31%</small></div></div></section>
    <section className="content-grid"><div id="meals" className="meal-section"><div className="section-heading"><div><p className="eyebrow">The Nigerian table</p><h2>Meals worth knowing.</h2></div><span className="count">{meals.length || '—'} dishes</span></div>{loading ? <p className="muted">Loading the table...</p> : <div className="meal-list">{meals.map((meal) => <article className="meal-card" key={meal.id}><img className="meal-art" src={meal.imageUrl} alt={meal.name} loading="lazy" /><div className="meal-info"><div><p className="meal-kicker">Nigerian favourite</p><h3>{meal.name}</h3><p>{meal.description}</p></div><div className="meal-footer"><span>{hasAllAccess ? 'Included with membership' : `${meal.caloriesPreview} kcal preview`}</span><button className="unlock-button" onClick={() => openMeal(meal)}>View full plate <span>↗</span></button></div></div></article>)}</div>}{detailsLoading && <div className="details-panel"><p className="eyebrow">Payment confirmed</p><h3>Loading your full plate...</h3><p className="muted">We are waiting for Stripe's verified purchase event.</p></div>}{fullMeal && !fullMeal.isLocked && <div className="details-panel"><p className="eyebrow">Full nutrition profile</p><h3>{fullMeal.name}</h3><div className="nutrition-grid">{Object.entries(fullMeal.premiumNutrition ?? {}).filter(([key]) => key !== 'ingredients').map(([key, value]) => <div key={key}><span>{key}</span><strong>{Array.isArray(value) ? value.join(', ') : value}</strong></div>)}</div><p className="ingredients-label">Ingredients</p><p className="ingredients">{Array.isArray(fullMeal.premiumNutrition?.ingredients) ? fullMeal.premiumNutrition.ingredients.join(' · ') : 'Ingredients are available in your premium profile.'}</p></div>}</div><aside className="side-panel"><div id="membership" className="membership"><p className="eyebrow">{hasAllAccess ? 'All access active' : 'All access'}</p><h2>{hasAllAccess ? <>Membership<br /><em>active.</em></> : <>Eat with<br /><em>certainty.</em></>}</h2><p>{hasAllAccess ? 'Your membership includes every recipe, portion guide, and micronutrient detail.' : 'Unlock every recipe, portion guide, and micronutrient detail for $20 a month.'}</p>{!hasAllAccess && <button className="dark-button" onClick={() => setCheckout({ type: 'subscription', label: 'NutriPay All Access' })}>Start membership <span>↗</span></button>}<div className="membership-detail"><span>{hasAllAccess ? 'All meals included' : 'Cancel anytime'}</span><span>New recipes weekly</span></div></div>{notice && <div className="notice-panel" role="status">{notice}</div>}</aside></section>
    <footer><span>nutripay / 2026</span><span>Eat well, understand more.</span></footer>
    {notice && <div className="payment-banner" role="status">{notice}</div>}
    {checkout && <Checkout mode={checkout} onClose={() => setCheckout(null)} onDone={(message) => { const paidMealId = checkout.type === 'meal' ? checkout.mealId : null; setCheckout(null); setNotice(message); if (paidMealId) loadFullMeal(paidMealId); }} />}
  </main>;
}
