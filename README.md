# Digital Mojo — Meeting Intelligence Platform

AI-powered meeting analysis: Google Meet → Fireflies → Gemini 2.5 Pro → PostgreSQL → Email.

## Architecture

```
Google Meet → Fireflies joins → Transcript generated
→ Webhook/Polling → BullMQ queue → Fireflies service (fetch)
→ Gemini 2.5 Pro (analyze) → PostgreSQL (store)
→ Zoho SMTP (email CEO + HR) → Next.js Dashboard
```

## Prerequisites

- Node.js 22+
- PostgreSQL 15+
- Redis 7+
- Fireflies.ai account with API key
- Google AI Studio / Gemini API key
- Zoho Mail account with app password

## Setup

### 1. Clone and install

```bash
cd fireflies
npm install
```

### 2. Environment variables

Copy `.env` and fill in all values:

```bash
cp .env .env.local
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `FIREFLIES_API_KEY` | From Fireflies → Settings → Integrations → API |
| `GEMINI_API_KEY` | From Google AI Studio |
| `ZOHO_SMTP_HOST` | `smtp.zoho.in` (India) or `smtp.zoho.com` |
| `ZOHO_SMTP_PORT` | `465` |
| `ZOHO_SMTP_USER` | Your Zoho email address |
| `ZOHO_SMTP_APP_PASSWORD` | See below |
| `CEO_EMAIL` | Report recipient |
| `HR_EMAIL` | Report recipient |
| `REDIS_URL` | Redis connection URL |
| `JWT_SECRET` | Random 64-char string (use `openssl rand -hex 32`) |
| `FIREFLIES_WEBHOOK_SECRET` | Optional, set same value in Fireflies dashboard |

### Generating a Zoho App Password

1. Log into Zoho Mail → **Settings** (top right gear icon)
2. Navigate to **Security** → **App Passwords**
3. Click **Generate New App Password**
4. Name it (e.g. "Meeting Intelligence") and click **Generate**
5. Copy the displayed password — it won't be shown again
6. Paste it into `ZOHO_SMTP_APP_PASSWORD`

> If you're on Zoho India data center, use `smtp.zoho.in` instead of `smtp.zoho.com`

### 3. Database setup

```bash
# Run migrations
npx prisma migrate deploy

# Or in development (creates migration files)
npx prisma migrate dev --name init

# Seed default users
npm run db:seed
```

Default users are created during database seeding. Set your own credentials before production deployment.
- `ceo@digitalmojo.in` — CEO role
- `hr@digitalmojo.in` — HR role
- `manager@digitalmojo.in` — Manager role
- `employee@digitalmojo.in` — Employee role

### 4. Start the app

Terminal 1 — Next.js:
```bash
npm run dev
```

Terminal 2 — BullMQ workers:
```bash
npm run worker
```

Open http://localhost:3000 → redirects to login.

### 5. Configure Fireflies webhook

In Fireflies dashboard → **Settings** → **Integrations** → **Webhooks**:
- URL: `https://yourdomain.com/api/fireflies/webhook`
- Event: `Transcript Completed`
- If a secret is shown, copy it to `FIREFLIES_WEBHOOK_SECRET`

If webhooks aren't available on your plan, the polling worker runs automatically every 5 minutes.

### 6. Manual sync

To pull existing transcripts immediately:
```bash
# Via API (requires auth token)
curl -X POST https://yourdomain.com/api/fireflies/sync \
  -H "Cookie: auth_token=<your-token>"
```

## Dashboard pages

| Route | Access | Description |
|---|---|---|
| `/dashboard` | All | Overview stats + recent meetings |
| `/dashboard/meetings` | All | Paginated meeting list with filters |
| `/dashboard/meetings/[id]` | RBAC | Full analysis, transcript, action items |
| `/dashboard/analytics` | CEO, HR | Employee rankings, sentiment, trends |
| `/dashboard/employees` | CEO, HR | Per-employee performance cards |
| `/dashboard/clients` | CEO, HR, Manager | Client health overview |

## Role permissions

| Role | Access |
|---|---|
| CEO | Full access to everything |
| HR | Employee analytics + all meetings |
| Manager | All team meetings |
| Employee | Only meetings they attended |

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login, returns JWT cookie |
| `POST` | `/api/auth/logout` | Clear session |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/meetings` | List meetings (paginated, filtered) |
| `GET` | `/api/meetings/[id]` | Single meeting with analysis |
| `GET` | `/api/analytics` | Aggregated analytics data |
| `POST` | `/api/fireflies/webhook` | Fireflies webhook endpoint |
| `POST` | `/api/fireflies/sync` | Trigger manual sync |

## Docker deployment

```bash
# Build and start all services
docker compose up -d

# Run migrations inside web container
docker compose exec web npx prisma migrate deploy

# Seed users
docker compose exec web npm run db:seed
```

### Production environment file

Create `.env.production` with all production values before running Docker.

## Queue system

Three BullMQ queues with automatic retry:

1. **transcript-processing** — Fetches from Fireflies API, saves to DB
2. **meeting-analysis** — Sends to Gemini, stores result  
3. **email-delivery** — Sends report via Zoho SMTP (5 retries)
4. **fireflies-polling** — Cron every 5 minutes (fallback to webhooks)

Monitor queues: install Bull Board for a UI, or use Redis CLI `KEYS bull:*`.

## Folder structure

```
/app              Next.js App Router pages + API routes
/components       UI components (badge, card, sidebar, charts)
/lib              Prisma client, Redis, auth, logger
/services         Fireflies, Gemini, Email service modules
/jobs             BullMQ queues and workers
/prisma           Schema + migrations
/types            TypeScript interfaces
/utils            Seed script
```
