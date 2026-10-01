# NutriPay

A nutrition paywall assessment built with React, Express, PostgreSQL, Prisma, and Stripe.

## Setup

1. Install Docker Desktop and the Stripe CLI.
2. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`.
3. Copy `.env.example` to `.env` and set the same `DB_NAME`, `DB_USER`, and `DB_PASSWORD` values used by both the PostgreSQL and backend containers.
4. Create a Stripe test-mode recurring Price for `$20/month` and set its **price ID** as `STRIPE_MONTHLY_PRICE_ID`. The value must start with `price_`, not `prod_`.
5. Fill in `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, and a real `JWT_SECRET` in the environment files.
6. Start the complete stack with the Docker commands below.

## Docker development

Docker runs PostgreSQL, the Express API, and the React frontend together. Prisma is installed inside the backend image, so PostgreSQL and Prisma do not need to be installed locally.

Start the stack using the frontend environment file as Compose's interpolation file. This passes `VITE_STRIPE_PUBLISHABLE_KEY` to the frontend image build without exposing the backend secret key:

```sh
docker compose --env-file .env --env-file frontend/.env up --build
```

The backend container waits for PostgreSQL, runs `prisma db push`, seeds the sample meals, and starts the API. The frontend is served by Nginx.

Open:

- Frontend: `http://localhost:5173`
- API health check: `http://localhost:4000/api/health`

To stop the containers:

```sh
docker compose down
```

To delete the local PostgreSQL data and start over:

```sh
docker compose down -v
```

The `postgres_data` volume preserves users, meals, purchases, and subscriptions between normal restarts.

## Native development

If Docker is not running, the original Node-based commands still work, but PostgreSQL must be available locally and `DATABASE_URL` must point to it:

```sh
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

## Stripe webhooks

Install Stripe CLI and run:

```sh
stripe listen \
	--events payment_intent.succeeded,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed \
	--forward-to localhost:4000/api/stripe/webhook
```

Copy the printed `whsec_...` value into `backend/.env`. Use Stripe test mode cards such as `4242 4242 4242 4242` for successful payments.

## Receipts and payment confirmation

The API sends the authenticated user's email to Stripe as `receipt_email` for one-time meal payments and stores it on the Stripe Customer for subscriptions. To receive subscription invoice emails, enable successful payment and invoice emails in **Stripe Dashboard -> Settings -> Billing -> Customer emails** while Test mode is enabled. Stripe test receipts can be delayed or filtered by your mail provider, so the checkout UI is the authoritative immediate result and displays `Payment successful` only when Stripe returns a succeeded PaymentIntent.

After a successful payment, the verified webhook updates the local purchase or subscription record. Keep the Stripe CLI listener running during local testing so those events reach the API.

## Payment behavior

Prices are loaded by the backend. The browser cannot choose an amount or unlock premium content. Verified webhook events create meal purchases and synchronize subscription state. Duplicate webhook deliveries are ignored using `ProcessedWebhookEvent`.
