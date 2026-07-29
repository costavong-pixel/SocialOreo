# SocialOreo

SocialOreo is a Next.js application for short-form social creative
intelligence, audits, Trend Radar, and Competitor Board reporting.

## Local development

1. Install Node.js 20 or newer and PostgreSQL.
2. Copy `.env.example` to `.env` and fill values locally.
3. Run `npm ci`, `npx prisma generate`, and `npx prisma migrate deploy`.
4. Start the app with `npm run dev`.

The local development server listens on `http://localhost:3002`.

## Verification

```text
npx prisma generate
npx prisma validate
npm run lint
npm run typecheck
npm test
npm run build
```

The public source snapshot contains no deployment instructions, production
configuration, credentials, customer records, or provider secrets.

Product names are **Trend Radar** and **Competitor Board**. No `/watch` route
is part of this project.
