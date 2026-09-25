# Catalog Quote

A multi-tenant product catalog builder. Businesses build a mobile-friendly catalog, share its link (Instagram bio, WhatsApp, QR codes) and receive quote requests on WhatsApp. No payments, no checkout.

- **Stack:** Next.js 16 (App Router, TypeScript strict, Tailwind v4), Firebase Auth (email/password + Google), Firestore, Cloud Storage, Firebase App Hosting, zod, Firebase Emulator Suite, vitest.
- **Structure:** category (page) → section (block on the page) → item (detail page). Specs and variants are free-form so any kind of business can use it.

## Contents

1. [Local development](#local-development)
2. [Project layout](#project-layout)
3. [How it works](#how-it-works)
4. [Testing](#testing)
5. [Firebase project setup](#firebase-project-setup)
6. [Deploying to App Hosting](#deploying-to-app-hosting)
7. [Operations notes](#operations-notes)

## Local development

Requirements: Node 22+, npm, and Java 17+ for the emulators (`brew install openjdk` on macOS). The npm scripts find a Homebrew or Temurin JDK on their own, so `java` does not have to be on your PATH.

```bash
npm install
cp .env.example .env.local      # defaults point at the emulators with a demo project
npm run emulators                # Auth, Firestore, Storage + Emulator UI at http://localhost:4000
```

In a second terminal:

```bash
npm run seed                     # demo store "jr-demo", owner demo@example.com / demo1234
npm run dev                      # http://localhost:3000
```

Useful URLs:

| URL | What |
| --- | --- |
| http://localhost:3000/jr-demo | Public demo catalog |
| http://localhost:3000/login | Sign in (demo@example.com / demo1234) |
| http://localhost:3000/dashboard | Admin |
| http://localhost:4000 | Emulator UI (data, auth users, storage files) |

`npm run emulators` imports and exports `./emulator-data`, so data survives restarts. Run `npm run seed -- --reset` to recreate the demo store. `npm run emulators:fresh` starts with empty data.

The demo store's WhatsApp number is a placeholder (`+919999999999`). Change it in Settings to test the hand-off with a real number.

## Project layout

```
src/app/
  page.tsx                        landing
  (admin)/login                   sign in / sign up
  (admin)/dashboard               store list → redirect
  (admin)/dashboard/new           create a store
  (admin)/dashboard/[storeId]     catalog (categories), categories/[id] (sections + items),
                                  categories/[id]/items/new|[itemId], quotes, quotes/[id], settings, share
  [store]                         public store home
  [store]/[category]              category page with sticky section tabs
  [store]/[category]/[item]       item page (gallery, specs, variants, add to quote)
  [store]/quote                   buyer's quote list + send on WhatsApp
  q/[quoteId]                     read-only submitted quote (unguessable id)
  api/quotes                      POST: validate, number and save a quote (Admin SDK)
  api/revalidate                  POST: owner-authenticated cache purge
src/lib/
  schemas/                        zod schemas + plain types shared by client and server
  firebase/                       browser SDK: init, auth, data access, uploads, converters
  server/                         Admin SDK: init, cached catalog reads, quote transaction, rate limit, App Check hook
  i18n/en.ts                      every UI string (translate later by adding a locale)
  slug.ts, whatsapp.ts, quote-number.ts, color.ts, countries.ts, quote-list.tsx, local-storage.ts, images/compress.ts
src/components/ui|admin|public    building blocks
scripts/seed.ts                   demo data for the emulators
tests/unit                        pure helpers (vitest)
tests/emulator                    security rules + quote numbering against the emulators
firestore.rules, storage.rules, firestore.indexes.json, firebase.json, apphosting.yaml
```

## How it works

**Data model (Firestore)**

```
users/{uid}                       email, name, createdAt
slugs/{slug}                      storeId            (keeps store slugs unique)
stores/{storeId}                  ownerId, name, slug, logo, about, brandColor, whatsappNumber (E.164),
                                  quotePrefix, quoteCounter, showPrices, currency, createdAt, updatedAt
stores/{storeId}/categories/{id}  name, slug, image, description, order, visible, sections: [{id, name, order, visible}]
stores/{storeId}/items/{id}       categoryId, sectionId, name, slug, code, description, images[], specs[], variants[],
                                  price, unit, order, visible
quotes/{quoteId}                  storeId, quoteNumber, buyer {name, country, note}, items[], status, createdAt
```

Sections live inside the category document, so a public category page costs one document read plus one items query.

**Admin** pages are client components using the Firebase JS SDK, protected by `firestore.rules` and `storage.rules` (deny by default; owners only touch their own stores; nobody can create quotes from the client; only `status` can change on a quote).

**Public** pages render on the server with the Admin SDK and are cached with Incremental Static Regeneration: each store, category and item page is rendered on its first visit, then served from cache and refreshed at most every 60 seconds (`generateStaticParams` returns an empty list so Next.js treats them as cacheable). Data reads are tagged per store. When an owner saves, the dashboard calls `POST /api/revalidate` with their Firebase ID token; the server verifies ownership and purges the store's tags on the instance that handles the call. Other server instances and App Hosting's CDN pick up the change when their 60-second window runs out, and `expireTime` in `next.config.ts` stops a CDN from serving an old copy for longer than 3 minutes. In practice, edits show up on the public site within about a minute.

**Quotes.** The buyer's list lives in `localStorage` per store. Sending posts to `/api/quotes`, which validates with zod, checks a honeypot field, applies a per-IP rate limit (10 per 10 minutes, in memory), verifies every item against the live catalog (hidden or deleted items are rejected), assigns the next per-store number (`PREFIX-1001`, `PREFIX-1002`, …) inside a Firestore transaction, and returns the `wa.me` URL. The browser clears the list, shows a confirmation with an "Open WhatsApp again" button, and navigates with `location.href` so mobile browsers don't block it.

**Images** are resized in the browser (≈1600 px full + ≈400 px thumbnail, JPEG; PNG stays PNG) before upload to `stores/{storeId}/...`. Storage rules allow uploads only by the store owner (checked against Firestore), images only, 5 MB max. Files are deleted from Storage when photos, items, categories or stores are removed. Public pages use plain `<img>` tags instead of the Next image optimizer, which keeps Cloud Run work (and cost) down.

**App Check** is not enabled yet. `src/lib/server/app-check.ts` is the hook to fill in when you turn it on.

## Testing

```bash
npm run typecheck
npm run lint
npm test                 # unit tests: slug helper, WhatsApp message builder, quote numbering, colors, rate limit
npm run test:rules       # starts the emulators, runs security-rules tests and the quote-numbering transaction test
```

Manual QA checklist (375 px wide): store home → category (section tabs scroll and highlight) → item (swipe gallery, pick options, quantity) → floating quote button → quote page (edit qty/options, remove, name + searchable country, note) → send → confirmation → `/q/{id}`. In the dashboard: create store, add category/sections/items with photos, drag to reorder (and up/down buttons), move/duplicate/hide/delete with confirmations, quote inbox filters and status changes, share page QR download.

## Firebase project setup

1. **Create a project** at https://console.firebase.google.com and add a **Web app**. Copy the config into `.env.local` / `apphosting.yaml` (`NEXT_PUBLIC_FIREBASE_*`).
2. **Upgrade to the Blaze plan.** Cloud Storage and App Hosting require it. Blaze has no hard spending cap, so set a **budget alert**: Google Cloud console → Billing → Budgets & alerts → create a budget (for example ₹1,000 / $10 per month) with email alerts at 50 / 90 / 100 %. The free tier covers a small catalog; alerts tell you before anything unusual happens.
3. **Authentication** → Sign-in method → enable **Email/Password** and **Google** (set a support email). Add your production domain under Authentication → Settings → Authorized domains.
4. **Firestore** → create a database (production mode; location close to your users, e.g. `asia-south1`).
5. **Storage** → get started (same location). Note the bucket name (`<project>.firebasestorage.app`).
6. **Deploy rules and indexes** from your machine (`npm i -g firebase-tools`, `firebase login`):

   ```bash
   firebase use <your-project-id>
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```

7. Optional: seed the demo store into the real project with `NEXT_PUBLIC_USE_EMULATORS=false npm run seed -- --production` (needs Application Default Credentials, e.g. `gcloud auth application-default login`). Delete the demo store from the dashboard when you are done.

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._STORAGE_BUCKET`, `..._MESSAGING_SENDER_ID`, `..._APP_ID` | build + runtime | Web app config (not secret) |
| `NEXT_PUBLIC_SITE_URL` | build + runtime | Public origin; used in Open Graph tags and the `/q/{id}` link in WhatsApp messages |
| `NEXT_PUBLIC_USE_EMULATORS` | build + runtime | `true` locally to use the emulators |
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST` | runtime (local only) | Point the Admin SDK and seed script at the emulators |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | runtime (optional) | Service-account JSON for hosts without Application Default Credentials. Not needed on App Hosting. |

## Deploying to App Hosting

The site URL is compiled into the build (WhatsApp quote links, QR codes, link previews), and creating a backend starts a build straight away, so set it first.

1. Pick a backend ID and region. The default domain is `https://<backend-id>--<project-id>.<region>.hosted.app`; this repo is set up for backend `catalog-quote` in `asia-southeast1` (Singapore, the closest App Hosting region to India). Put that URL in `NEXT_PUBLIC_SITE_URL` in `apphosting.yaml` together with your web-app config, commit and push to GitHub.
2. Firebase console > **App Hosting** > *Get started*: region `asia-southeast1`, connect GitHub (authorize the Firebase app on the account that owns the repo), pick the repo, root directory `/`, live branch `main`, automatic rollouts on, backend ID `catalog-quote`, runtime **Node.js 24** (it must match `engines` in `package.json`), and link the existing web app. *Finish and deploy*.
3. Authentication > Settings > **Authorized domains**: add the hosted.app domain (and `localhost` if you test Google sign-in locally against the real project). Without it Google sign-in fails with `auth/unauthorized-domain`.
4. After the first rollout, check the URL on the backend page matches `NEXT_PUBLIC_SITE_URL`. If it differs, fix the value and push again; `NEXT_PUBLIC_*` values only change with a new build.
5. The backend runs as `firebase-app-hosting-compute@<project>.iam.gserviceaccount.com`, which is granted `roles/firebase.sdkAdminServiceAgent` (Firestore access for the Admin SDK). No key file is needed.
6. Deploy rules/indexes with the Firebase CLI whenever they change (`npm run deploy:rules`); App Hosting does not deploy them.

Every push to `main` rolls out automatically. Rollback: App Hosting keeps previous rollouts; pick one in the console to roll back.

## Operations notes

- **Cache freshness.** Public pages are ISR-cached for 60 s and purged on demand at the origin when an owner saves. The purge only reaches the server instance that handled it; other instances and the CDN refresh within 60 s (at most 3 minutes under `expireTime`).
- **Rate limit** is per server instance and resets on restart. The client IP is read from the right-hand end of `X-Forwarded-For` (the entry Google's load balancer appends), because the left-hand entries can be forged. Each instance logs how many entries the header had on its first request; if that is more than 2, set `TRUSTED_PROXY_HOPS` in `apphosting.yaml`. For stronger protection enable App Check and/or move the counter to Firestore.
- **Quote numbers** are allocated in a transaction on the store document; the security rules stop clients from changing `quoteCounter`.
- **Costs.** Public pages read one store doc + one category list + one items query per (uncached) render. Images are served straight from Cloud Storage. Keep an eye on Storage egress if catalogs get large photo galleries.
- **Out of scope for now:** payments, inventory, custom domains, themes beyond logo/color, staff accounts, CSV import, search, analytics, WhatsApp Business API, translations (all UI text is in `src/lib/i18n/en.ts` to make that easy).
