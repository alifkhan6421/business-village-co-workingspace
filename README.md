# Business Village

Website, booking system and admin panel for [Business Village](https://business-village.de), a coworking space.
German is the default language (`/de/...`), English the second (`/en/...`), with localized URLs and hreflang.

- **Public site**: home, coworking desks, meeting rooms, amenities, how it works, contact, legal pages and custom pages, all managed in the CMS.
- **Booking**: calendar booking (month, week, day) for guests and members, with confirmation emails, a private manage/cancel link for guests and a member account area.
- **Admin panel** (`/de/admin`): dashboard, calendar, bookings, desks, rooms, amenities, users, guests, inquiries, announcements, media library, website CMS, navigation, footer, SEO, email templates and logs, activity log, settings.

## Stack

Next.js 15 (App Router, TypeScript, server actions) · Tailwind CSS with shadcn-style components · Supabase (Postgres, Auth, Row Level Security, Storage) · Resend (email) · next-intl · FullCalendar · Tiptap · Playwright.

## Local setup

Requirements: Node 20+, Docker (for the local Supabase stack).

```bash
npm install
npx supabase start                 # local Postgres, Auth, Storage on :54321
cp .env.example .env.local         # then paste the anon + service_role keys printed by `supabase start`
npx supabase db reset              # applies supabase/migrations + supabase/seed.sql (LOCAL ONLY)
npm run seed:demo                  # demo accounts, demo images, sample member bookings
npm run dev                        # http://localhost:3000
```

To send email locally without Resend, run the mock API (`node tests/mock-email-server.mjs`) and set
`RESEND_API_KEY=test` and `EMAIL_API_BASE_URL=http://127.0.0.1:4010`. Sent emails are listed at `http://127.0.0.1:4010/emails`.

### Demo accounts

| Role   | Email                        | Password         |
| ------ | ---------------------------- | ---------------- |
| Admin  | admin@business-village.de    | `DemoAdmin123!`  |
| Member | member@business-village.de   | `DemoMember123!` |

Change or delete these accounts before going live (Admin → Users).

## Database

All schema changes are SQL migrations in `supabase/migrations`, applied in order. They only add or alter, never drop data.

- **Never run `supabase db reset` or `npm run db:reset` against a hosted project.** For hosted databases use `npx supabase db push` (applies new migrations only).
- New change → new migration file: `npx supabase migration new <name>`, then `npx supabase migration up` locally and `npm run db:types` to refresh `src/lib/supabase/database.types.ts`.
- `supabase/seed.sql` holds the starting content (desks A-01…A-04 and B-01…B-04; Berlin, Munich, Hamburg and Focus Room; 10 amenities; pages; email templates). Run it once on an empty database only; after that, content is edited in the admin panel.

Key points of the data model:

- **Bookings** carry a reference `BV-YYYY-NNNNNN` from a sequence. Two Postgres exclusion constraints (`bookings_no_overlap_workspace`, `bookings_no_overlap_room`) make double booking impossible even for simultaneous requests; booking functions additionally lock the resource row and check opening hours, slot length, lead time and admin blocks (`resource_blocks`).
- **Guests** never get an account. Their manage link contains a random token; only its SHA-256 hash is stored (`bookings.management_token_hash`).
- **Amenities** are relational (`amenities`, `amenity_translations`, `workspace_amenities`, `room_amenities`), so renaming one updates every desk and room.
- **CMS**: `pages` / `page_translations` and `page_sections` / `page_section_translations`. Language-specific text lives in the translation rows, so editing English never touches German.
- **Media**: `media` rows (with alt text DE/EN) point at the public `media` storage bucket. Images in use (galleries, sections, logo) cannot be deleted.

## Security

- **Row Level Security** is enabled on every table. Visitors can only read published content; members only their own profile and bookings; everything else is admin-only (`public.is_admin()`).
- Members cannot change their own role: the `role` column is not writable through the API; roles change only via `admin_set_user_role()`, which also refuses to remove the last admin.
- Writes to bookings go through `SECURITY DEFINER` functions. Guest booking and token cancellation are callable **only with the service role**, i.e. from server actions that validate input, rate-limit and hash the token.
- Uploads are checked by MIME type, extension and magic bytes, limited to 8 MB, and re-encoded with sharp (EXIF and GPS data stripped).
- Rich text from the CMS is sanitized on the server before it is stored.
- `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` are only read in server code. `npm run test:security` checks that none of them appear in the client bundle.
- Admin actions are written to `audit_logs` (Admin → Activity).

## Email

Transactional emails (booking confirmation, update, cancellation, admin messages, contact confirmation, welcome, email verification, password reset, admin notifications) are sent through Resend from server code. Subjects and bodies are editable per language in Admin → Settings → Email templates. Every send is logged in Admin → Email logs with status and preview.

Setting up the sending domain:

1. In Resend, add the domain `business-village.de` (or a subdomain such as `mail.business-village.de`).
2. Add the DNS records Resend shows (SPF `TXT`, DKIM `TXT`/`CNAME`, optionally DMARC `TXT` `_dmarc` with `v=DMARC1; p=none;`) at the DNS provider.
3. Wait until Resend shows the domain as verified.
4. Create an API key with "Sending access" and set `RESEND_API_KEY`. Set `EMAIL_FROM` to an address on the verified domain.

Until a key is set, emails are not sent and appear as "failed" in the email log; booking itself keeps working.

### Inbound replies (optional)

Guests can reply to booking emails; replies are attached to the booking in Admin → Bookings → Messages. **This only works once DNS and the provider are configured:**

- [ ] Enable receiving for the domain in Resend and add the MX record it shows (use a subdomain such as `reply.business-village.de` if the main domain already receives mail elsewhere).
- [ ] Set `EMAIL_REPLY_TO` to an address on that receiving domain.
- [ ] In Resend → Webhooks, add `https://<your-domain>/api/webhooks/resend` for the event `email.received`.
- [ ] Copy the webhook signing secret into `RESEND_WEBHOOK_SECRET` and redeploy.
- [ ] Reply to a booking email and check that the message appears on the booking.

The webhook verifies the Svix signature, matches the booking by its `BV-…` reference in the subject, strips quoted text and ignores duplicates. Without the secret it answers `503` and stores nothing.

## Tests

```bash
npm run typecheck && npm run lint
npm run test:security   # RLS, grants, storage, admin RPCs, secrets in bundle, 10 parallel bookings of Berlin Room 10:00–11:00
npm run test:e2e        # Playwright: guest flow DE/EN, member flow, taken slot, CMS hero DE/EN isolation,
                        # gallery cover image, "Podcast Equipment" amenity, contact, imprint, admin booking
```

Both suites run against the **local** Supabase and refuse other URLs unless `ALLOW_REMOTE_TESTS=1` is set (only for a dedicated test project, never production). They clean up the data they create. `test:e2e` starts the dev server and the mock email API if they are not running; set `PW_CHROMIUM_PATH` to use a preinstalled Chromium.

## Deployment (Vercel + Supabase)

1. **Supabase**: create a project (region EU, e.g. Frankfurt). Link and push the schema:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push                       # migrations only, safe on existing data
   psql "<connection string>" -f supabase/seed.sql   # first time only: starting content
   ```
   Then run `npm run seed:demo` once with the hosted URL and service role key in `.env.local` if you want the demo accounts and images.
2. **Supabase Auth** → URL configuration: set *Site URL* to the production URL and add `https://<domain>/**` to the redirect URLs. Email confirmation emails are sent by the app through Resend, so Supabase's own SMTP is not needed.
3. **Vercel**: import the GitHub repository (framework preset Next.js) and set the variables from `.env.example` for Production and Preview. `NEXT_PUBLIC_APP_URL` must be the public URL.
4. Point the domain at Vercel, then update `NEXT_PUBLIC_APP_URL` and the Supabase Auth URLs to `https://business-village.de`.
5. Replace the placeholder legal texts (Impressum, Datenschutz, AGB) in Admin → Website → Pages with legally reviewed versions.

## Project layout

```
src/app/[locale]/(site)     public pages, booking, account
src/app/[locale]/admin      admin panel
src/app/api/webhooks        inbound email webhook
src/components              UI, sections, booking widget, admin forms
src/lib                     server actions (booking, admin/*), email, Supabase clients, time zone helpers
messages/de.json, en.json   UI translations
supabase/migrations         database schema, RLS, functions
scripts                     demo seeding
tests                       security test, Playwright e2e, mock email API
```
