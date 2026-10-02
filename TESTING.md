# NutriPay Testing Guide

This guide explains how to test the nutrition paywall and Stripe subscription flows in the sandbox environment.

## Test Account

Use the pre-created test account:

```text
Email:    testflight@gmail.com
Password: Testflight123
```

This account is for assessment testing only.

## Application URLs

```text
Authentication: https://staging.tsionark.com/nutripay/
Membership:     https://staging.tsionark.com/nutripay/membership
API health:     https://staging.tsionark.com/nutripay-api/health
```

## Stripe Webhook

Stripe should send events to:

```text
https://staging.tsionark.com/nutripay-api/stripe/webhook
```

After a payment, confirm that the webhook request returns HTTP `200`. A failed webhook can leave the payment successful in Stripe while the deployed entitlement is not yet updated.

## Test Card Details

Because this application uses Stripe sandbox/test mode, use:

```text
Card number:     4242 4242 4242 4242
Expiration date: Any valid future date, for example 12/34
CVC:             Any 3-digit number
Postal code:     Any valid value
```

This card simulates a standard Visa payment that always succeeds.

Never use real card details in the sandbox or in assessment documentation.

## Test 1: Authentication

1. Open the authentication URL.
2. Select **Sign in**.
3. Enter:

   ```text
   Email:    testflight@gmail.com
   Password: Testflight123
   ```

4. Submit the form.
5. Confirm that the app navigates to the membership page.

Registration can also be tested by switching the form to **Create account** and using a different email address.

## Test 2: Paywall Preview

1. Open the membership page.
2. Confirm that Nigerian meals are visible, including dishes such as jollof rice, beef suya, moi moi, egusi soup, puff puff, and pepper soup.
3. Confirm that each meal initially shows preview information such as calories.
4. Confirm that complete information is not shown before purchase, including:
   - Full nutrition values
   - Portion size
   - Ingredients
5. Select **View full plate** for a locked meal.
6. Confirm that the Stripe checkout modal opens.

The backend, not the browser, decides whether a meal is unlocked. The browser cannot choose the payment amount or grant itself access.

## Test 3: One-Time Meal Unlock

1. Sign in with the test account.
2. Select **View full plate** on a locked meal.
3. Enter the Stripe sandbox card details above.
4. Confirm the payment.
5. Confirm that the checkout displays a clear payment-success message.
6. Confirm that the selected meal displays its full profile directly inside its meal card:
   - Calories
   - Protein
   - Carbohydrates
   - Fat
   - Fiber
   - Portion size
   - Ingredients
7. Refresh the page.
8. Select the same meal again.
9. Confirm that it opens the full nutrition profile without requesting another payment.

The one-time purchase unlocks only the selected meal.

## Test 4: Full Access Subscription

1. Use an account that does not already have an active subscription.
2. Open the membership page.
3. Select **Start membership**.
4. Confirm that the checkout amount is `$20/month`.
5. Enter the Stripe sandbox card details.
6. Confirm the subscription payment.
7. Confirm that the membership panel changes to a subscribed/all-access state.
8. Confirm that **Start membership** is no longer shown.
9. Confirm that meals are labeled as included with membership.
10. Open several different meals.
11. Confirm that every meal displays its complete nutrition profile without another individual payment.
12. Refresh the page and confirm that all-access status remains active.

An active or trialing subscription unlocks every meal. The backend also rejects individual meal PaymentIntents for users with an active subscription.


## Expected Stripe Events

The backend handles:

```text
payment_intent.succeeded
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

Webhook events are processed idempotently, so Stripe can safely retry an event without creating duplicate purchases or subscriptions.



### Test account already has access

Use the existing account to test all-access behavior. To test the locked paywall flow again, use a new test account or a different meal.

