# SocialOlla Final Pricing Decision

**Status:** OWNER APPROVED — REPOSITORY AUTHORITATIVE  
**Scope:** SocialOlla launch pricing and included monthly credit policy

## Canonical owner decision

The owner has completed the final SocialOlla pricing decision.

### Post lifetime offer

- **Product:** SocialOlla Post
- **Price:** **$99 USD one-time**
- **Access model:** **Lifetime access to Post**
- **Included monthly credits:** **1,200 credits per month**

The lifetime Post entitlement and the monthly credit allowance are separate concepts. Resetting or exhausting the monthly included credits does not cancel the customer's lifetime Post entitlement.

## Included monthly credit policy

The 1,200 credits included with the lifetime Post offer are a recurring monthly usage allowance.

Canonical rules:

- **MONTHLY_INCLUDED_CREDITS=1200**
- **MONTHLY_INCLUDED_CREDITS_ROLLOVER=NO**
- **MONTHLY_INCLUDED_CREDITS_RESET=MONTHLY**
- Unused included monthly credits expire at the monthly reset and do not carry into the next month.
- The next monthly cycle receives a fresh 1,200-credit allowance.

These included credits are intended primarily for **Watch** and other **credit-metered SocialOlla features that may be introduced in the future**.

Credits are a usage-control mechanism for metered functionality; they are not the lifetime Post entitlement itself.

## Purchased credits remain separate

Purchased/add-on credits are a separate balance from the 1,200 included monthly credits. This decision does not silently change the existing purchased-credit validity policy. Any future change to purchased-credit price, validity, expiry, or consumption priority requires a separate owner decision.

Implementation must keep included monthly credits distinguishable from purchased credits so monthly reset behavior cannot accidentally remove purchased balances.

## Commercial authority

This decision supersedes all historical, provisional, sandbox, test, and previously discussed SocialOlla Post launch prices.

Canonical commercial state:

- **POST_LIFETIME_PRICE_USD=99**
- **POST_BILLING_MODEL=ONE_TIME_LIFETIME**
- **POST_MONTHLY_INCLUDED_CREDITS=1200**
- **POST_MONTHLY_INCLUDED_CREDITS_ROLLOVER=NO**
- **POST_MONTHLY_INCLUDED_CREDITS_RESET=MONTHLY**
- **CREDIT_PRIMARY_USE=WATCH_AND_FUTURE_METERED_FEATURES**
- **PRICING_STATUS=OWNER_APPROVED**

## Implementation boundary

This document records the approved commercial decision only.

It does **not** by itself authorize:

- changing production checkout amounts;
- enabling live payment collection;
- deploying production;
- changing Square production configuration;
- changing provider effects;
- changing purchased-credit policy.

Production pricing copy and checkout configuration may be wired only through the normal bounded implementation/review/owner deployment process.

Once implemented, customer-facing copy must clearly communicate that:

1. $99 is a one-time payment for lifetime Post access;
2. the offer includes 1,200 credits each month;
3. unused included monthly credits do not roll over;
4. included monthly credits reset every month; and
5. credits are intended for Watch and other metered SocialOlla capabilities.
