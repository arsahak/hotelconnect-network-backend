# HotelConnect Backend

Express + TypeScript + MongoDB API for HotelConnect.

Current scope: one email + password sign-in for every dashboard user, password
reset by emailed code, own account (profile, avatar, password) and the platform
team. Roles: superadmin, admin, hotel_manager, hotel_staff, supplier.

Every feature follows the same order: `models/` → `validators/` →
`controllers/` → `routes/` (with Swagger docs) → register in `routes/index.ts`.

Member numbers (hotels H0001…, suppliers L001…) come from
`utils/memberNumber.ts`.

## Run locally

1. Start local MongoDB (`brew services start mongodb-community`) and open
   Compass at `mongodb://127.0.0.1:27017` — the database is `hotelconnect`.
2. `npm install`
3. `npm run seed:superadmin` — creates the first superadmin from `.env`
4. `npm run seed:test-users` — optional: one test login per role (`*@hotelconnect.test`, password in `scripts/seedTestUsers.ts`)
5. `npm run seed:demo` — optional: demo hotels, suppliers, jobs, vouchers and stories for the website (emails use `.test`, never delivered)
6. `npm run dev`

- API: http://localhost:8000/api/v1
- Docs: http://localhost:8000/api-docs
- Health: http://localhost:8000/api/v1/health

## Admin API and photos

Every public resource also has admin routes under `/<resource>/admin`
(hotels, suppliers, vacancies, vouchers, articles) for the dashboard, plus
`PUT /<resource>/admin/:id/image` for photos (suppliers: `/logo` and `/image`).

Photos go to DigitalOcean Spaces when `DO_SPACES_*` is set. Without those keys,
in development they are saved in `backend/uploads/` and served at `/uploads`.
Story HTML is cleaned (`utils/sanitizeHtml.ts`) before it is stored.

## Contract and permit reminders

`utils/reminders.ts` emails each hotel one overview when a contract ends, the
last day to cancel an auto-renewing contract comes up, or a permit expires
within 30 days (briefing §3.4.1, §3.4.4). The email goes to the hotel's
"system alerts" address (else the general one) and is skipped when the hotel
switched system alerts off. Each date is reminded once; a changed date gets a
new reminder.

The API server checks this on start and every hour. For hosting without a
long-running server, run `npm run reminders:send` from a daily cron job.
Set `DASHBOARD_URL` for the link in the email.
