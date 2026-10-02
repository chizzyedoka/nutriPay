# NutriPay Stripe Flow Explained

This document explains how Stripe works inside NutriPay. It is written for someone who is new to Stripe and wants to understand what happens from the moment a user clicks a payment button until premium nutrition data becomes available.

## 1. The Big Picture

NutriPay has two payment products:

1. **One-time meal unlock**
   - The user pays for one meal.
   - Only that meal's complete nutrition profile becomes available.

2. **Full-access subscription**
   - The user pays `$20/month`.
   - Every meal's complete nutrition profile becomes available while the subscription is `active` or `trialing`.
   - The user does not need to purchase meals individually.

Stripe handles card collection and payment processing. NutriPay's backend handles:

- Which product the user is buying
- The correct price
- Which application user made the payment
- Whether the payment grants access
- Saving purchases and subscriptions in PostgreSQL

The browser must never be trusted to decide that a meal is paid for. The backend verifies payment state with Stripe and stores the entitlement in the database.

## 2. Important Stripe Terms

### Stripe Customer

A Customer represents the application user inside Stripe. NutriPay stores the Stripe Customer ID on the `User` record:

```text
User.stripeCustomerId = cus_...
```

The Customer stores the user's email and can be reused for future meal purchases and subscriptions.

### PaymentIntent

A PaymentIntent represents a payment attempt for a specific amount.

For a one-time meal purchase, the backend creates a PaymentIntent for the meal's server-side price:

```text
PaymentIntent amount: 499 cents
Currency: USD
```

A PaymentIntent ID looks like:

```text
pi_...
```

The PaymentIntent eventually receives a status such as:

- `requires_payment_method`
- `requires_action`
- `processing`
- `succeeded`
- `canceled`

### Subscription

A Subscription represents recurring billing. NutriPay uses a Stripe recurring Price configured for `$20/month`.

A Subscription ID looks like:

```text
sub_...
```

The recurring Price ID looks like:

```text
price_...
```

Do not confuse a Product ID (`prod_...`) with a Price ID (`price_...`). The backend must use the recurring Price ID.

### Client Secret

The backend returns a PaymentIntent client secret to the frontend. It allows Stripe.js to complete the specific payment without exposing the Stripe secret key.

A client secret is not the same as the Stripe secret key:

- Safe to send to the frontend: PaymentIntent client secret
- Never send to the frontend: `STRIPE_SECRET_KEY`

### Webhook

A webhook is an HTTP request sent by Stripe to the backend when something happens in Stripe.

Examples:

```text
payment_intent.succeeded
customer.subscription.updated
invoice.paid
```

The backend verifies that the request really came from Stripe using the webhook signing secret.

## 3. One-Time Meal Purchase Flow

### Step 1: User opens the membership page

The frontend requests public meal data:

```http
GET /api/meals
```

The response includes preview fields such as:

- Meal name
- Description
- Preview calories
- Image

The premium nutrition JSON is not included in the public meal-list response.

### Step 2: User clicks `View full plate`

The frontend first requests the protected meal details:

```http
GET /api/meals/:mealId
```

The backend checks whether the signed-in user has either:

- An existing purchase for that meal, or
- An active/trialing subscription

If neither exists, the response remains locked and the frontend opens checkout.

### Step 3: Frontend requests a PaymentIntent

The frontend sends only the meal ID:

```http
POST /api/payments/meal-intents
Content-Type: application/json

{
  "mealId": "meal-id-from-the-api"
}
```

The frontend does **not** send:

- The amount
- The currency
- The user ID
- An entitlement flag

The backend loads the meal from PostgreSQL and calculates the amount from the database.

The backend also checks whether the user already has an active subscription. If they do, it refuses to create a single-meal payment because the subscription already includes all meals.

### Step 4: Backend creates the Stripe Customer

If the user does not already have a Stripe Customer, the backend creates one:

```ts
stripe.customers.create({
  email: user.email,
  metadata: { userId: user.id }
});
```

The returned `cus_...` ID is saved to the user record.

### Step 5: Backend creates the PaymentIntent

The backend creates the PaymentIntent using its trusted values:

```ts
stripe.paymentIntents.create({
  amount: meal.unlockPriceCents,
  currency: 'usd',
  customer: customerId,
  receipt_email: user.email,
  metadata: {
    userId: user.id,
    mealId: meal.id
  }
});
```

The backend returns only safe checkout information:

```json
{
  "clientSecret": "pi_..._secret_...",
  "amountCents": 499
}
```

### Step 6: Frontend displays Stripe Payment Element

The frontend gives the client secret to Stripe Elements:

```tsx
<Elements stripe={stripePromise} options={{ clientSecret }}>
  <PaymentForm />
</Elements>
```

Payment Element renders the card form. NutriPay does not receive or store raw card numbers.

### Step 7: User confirms payment

The frontend calls:

```ts
stripe.confirmPayment({
  elements,
  confirmParams: {
    return_url: paymentReturnUrl
  },
  redirect: 'if_required'
});
```

Two things can happen:

1. The payment completes immediately and Stripe returns a succeeded PaymentIntent.
2. The bank requires authentication, so Stripe temporarily redirects the user and then returns them to NutriPay.

### Step 8: Direct confirmation creates immediate access

When Stripe returns a successful PaymentIntent, the frontend sends its ID to NutriPay:

```http
POST /api/payments/confirm
Content-Type: application/json

{
  "paymentIntentId": "pi_..."
}
```

The backend then:

1. Retrieves the PaymentIntent directly from Stripe.
2. Confirms the status is `succeeded`.
3. Confirms that the PaymentIntent belongs to the signed-in user using the Stripe Customer ID or metadata.
4. Reads the meal ID from Stripe metadata.
5. Creates the `PremiumPurchase` database record.
6. Returns success to the frontend.

The purchase is written with an upsert, so repeating the confirmation does not create duplicates.

### Step 9: Full nutrition appears in the meal card

After confirmation, the frontend requests:

```http
GET /api/meals/:mealId
```

The backend sees the purchase record and returns the premium nutrition JSON. The details render directly inside the paid meal card.

## 4. Full-Access Subscription Flow

### Step 1: User clicks `Start membership`

The frontend requests:

```http
POST /api/billing/subscription-intent
```

The request does not include a price ID or amount. The backend uses the configured environment value:

```env
STRIPE_MONTHLY_PRICE_ID=price_...
```

### Step 2: Backend prevents duplicate subscriptions

Before creating a new Stripe Subscription, the backend checks PostgreSQL for an existing subscription with one of these statuses:

```text
active
trialing
incomplete
```

This prevents the same user from accidentally creating multiple subscriptions.

### Step 3: Backend creates the Subscription

The backend calls Stripe with the configured recurring Price:

```ts
stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: process.env.STRIPE_MONTHLY_PRICE_ID }],
  payment_behavior: 'default_incomplete',
  payment_settings: {
    save_default_payment_method: 'on_subscription'
  },
  metadata: {
    userId: user.id
  }
});
```

`default_incomplete` means Stripe creates the subscription but waits for the first invoice payment to complete.

The backend expands the first invoice's PaymentIntent or confirmation secret and returns its client secret to the frontend.

### Step 4: Frontend confirms the first invoice payment

The same Stripe Payment Element is used for the first subscription payment.

The checkout button displays:

```text
Pay $20 / month
```

After Stripe confirms the first invoice payment, the frontend receives the Stripe Subscription ID and calls:

```http
POST /api/billing/confirm
Content-Type: application/json

{
  "subscriptionId": "sub_..."
}
```

### Step 5: Backend verifies and saves the subscription

The backend retrieves the Subscription directly from Stripe and verifies:

- It belongs to the signed-in user's Stripe Customer, or
- Its Stripe metadata contains the signed-in user's application user ID
- Its status is `active` or `trialing`

Then it upserts the local `Subscription` record.

### Step 6: All meals become available

The entitlement rule is:

```text
active subscription -> all meals unlocked
trialing subscription -> all meals unlocked
```

The backend's meal entitlement service checks for an active subscription whenever protected meal details are requested.

The frontend updates the membership panel to an all-access/subscribed state and removes the `Start membership` button.

Individual meal payments are blocked for subscribed users at the backend, even if somebody tries to call the endpoint manually.

## 5. What the Webhook Does

Direct confirmation improves the immediate user experience, but webhooks remain essential because Stripe can change billing state later when the user is not on the website.

Examples:

- A recurring invoice is paid next month.
- A recurring invoice fails.
- A subscription is canceled from the Stripe Dashboard.
- A subscription changes to `past_due`.
- Stripe retries an event after a temporary network failure.

The production webhook URL is:

```text
https://staging.tsionark.com/nutripay-api/stripe/webhook
```

### Webhook request path

The request travels through the system like this:

```text
Stripe
  -> HTTPS
  -> Nginx on the VPS
  -> /nutripay-api/stripe/webhook
  -> backend container port 4000
  -> Express webhook router
  -> Stripe signature verification
  -> Prisma transaction
  -> PostgreSQL
```

### Raw request body requirement

Stripe signatures are calculated from the exact raw request body. The backend must register the webhook route before normal JSON parsing:

```ts
app.use(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  webhookRoutes
);

app.use(express.json());
```

If `express.json()` runs first, the body changes from raw bytes into a parsed object and Stripe signature verification can fail.

### Signature verification

The webhook handler uses:

```ts
Stripe.webhooks.constructEvent(
  request.body,
  request.header('stripe-signature') ?? '',
  process.env.STRIPE_WEBHOOK_SECRET
);
```

If the signature is invalid, the backend returns HTTP `400` and does not update the database.

Never disable signature verification in production.

## 6. Events NutriPay Handles

### `payment_intent.succeeded`

Used for one-time meal purchases.

The handler reads:

```text
intent.metadata.userId
intent.metadata.mealId
intent.id
intent.amount
```

It creates a `PremiumPurchase` record.

### `customer.subscription.created`

Records a newly created subscription and its current status.

### `customer.subscription.updated`

Updates the local subscription status when Stripe changes it.

This can happen when:

- A recurring invoice succeeds
- A payment fails
- Cancellation is scheduled
- The subscription changes state

### `customer.subscription.deleted`

Records the subscription as canceled. The user should no longer receive all-access entitlement after the subscription is no longer active.

### `invoice.paid`

Indicates that a recurring invoice was successfully paid. This is useful for monitoring and subscription billing reliability.

### `invoice.payment_failed`

Indicates that a recurring invoice could not be paid. The subscription may move to a restricted state depending on Stripe settings.

## 7. Webhook Idempotency

Stripe may deliver the same event more than once. This is normal and must not create duplicate application records.

NutriPay stores each processed Stripe event in:

```text
ProcessedWebhookEvent
```

The event ID is unique:

```text
evt_...
```

Before processing an event, the backend checks whether that event ID already exists. If it does, the backend responds successfully without repeating the database operation.

Purchases also use unique constraints:

```text
paymentIntentId is unique
userId + mealId is unique
```

This makes retries safe.

## 8. Why Both Direct Confirmation and Webhooks Exist

These mechanisms solve different problems.

### Direct confirmation

Used immediately after checkout while the user is waiting:

- Gives faster UI feedback
- Verifies the PaymentIntent or Subscription directly with Stripe
- Creates the local entitlement immediately
- Prevents the user from waiting indefinitely for a webhook

### Webhook

Used for reliable long-term synchronization:

- Works when the user is not on the site
- Handles future recurring invoices
- Handles cancellations and failed payments
- Supports Stripe retries
- Keeps PostgreSQL synchronized with Stripe

The webhook is the long-term billing synchronization mechanism. Direct confirmation is the immediate post-checkout experience.

## 9. Security Rules

### Never expose the Stripe secret key

Only the backend may use:

```env
STRIPE_SECRET_KEY=sk_...
```

The frontend may use:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_...
```

### Never trust the browser for prices

The browser sends a meal ID. The backend loads the amount from PostgreSQL.

### Never trust the browser for user identity

The backend gets the user ID from the authenticated session cookie.

### Never grant access from frontend success alone

The backend verifies Stripe status and writes the entitlement. The frontend only displays the result returned by the backend.

### Protect the webhook secret

The webhook signing secret must remain server-side:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

It must never be included in frontend variables or browser code.

## 10. Production Configuration

Backend environment variables:

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_MONTHLY_PRICE_ID=price_...
STRIPE_CURRENCY=usd
FRONTEND_ORIGIN=https://staging.tsionark.com
```

Frontend environment variables:

```env
VITE_API_URL=https://staging.tsionark.com/nutripay-api
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

Stripe Dashboard webhook endpoint:

```text
https://staging.tsionark.com/nutripay-api/stripe/webhook
```

The webhook endpoint must be reachable over HTTPS and must forward to the backend route through Nginx.

## 11. How to Debug a Payment

### Payment succeeded but meal remains locked

Check these in order:

1. Confirm the browser used the deployed frontend bundle.
2. Confirm the user is signed in to the same account that started payment.
3. Check whether the direct confirmation request returned HTTP `200`:

   ```text
   POST /nutripay-api/payments/confirm
   ```

4. Check the backend logs for Prisma errors.
5. Check Stripe Dashboard for the PaymentIntent status.
6. Check Stripe webhook delivery history.
7. Confirm `payment_intent.succeeded` returned HTTP `200`.
8. Confirm a `PremiumPurchase` row exists for the user and meal.

### Subscription payment succeeded but not all-access

Check:

1. The configured Stripe Price ID starts with `price_`.
2. The Stripe Subscription status is `active` or `trialing`.
3. The frontend called:

   ```text
   POST /nutripay-api/billing/confirm
   ```

4. The backend saved a local Subscription record.
5. `customer.subscription.created` or `customer.subscription.updated` returned HTTP `200`.
6. The signed-in user's Stripe Customer matches the subscription Customer.

### Webhook returns `400`

Common causes:

- Wrong `STRIPE_WEBHOOK_SECRET`
- The webhook URL points to the wrong path
- Nginx changed or removed the request body
- Express JSON parsing runs before the raw webhook route
- Stripe is sending to a different environment or account

### Webhook returns `500`

Common causes:

- Database credentials are wrong
- The database container is unavailable
- A referenced user or meal does not exist
- The backend environment has the wrong Stripe account keys
- A Prisma constraint failed

## 12. Testing Checklist

A complete evaluator run should verify:

- The test user can sign in.
- Public meal previews are visible.
- Premium ingredients and nutrition are hidden before payment.
- One meal can be unlocked once.
- The unlocked meal displays its full profile in its card.
- A second click on that paid meal does not request payment again.
- A `$20/month` subscription can be created.
- A subscribed user can open every meal.
- Subscribed users do not need individual meal payments.
- `Start membership` changes to the subscribed/all-access state.
- Refreshing the page preserves entitlement.
- Stripe webhook deliveries return HTTP `200`.
- Replayed webhook events do not create duplicate database records.
