# Expense Tracker

A simple full-stack expense tracker: add, edit, delete, and filter expenses, with a dashboard showing total spend, spend by category, and a monthly trend chart.

## Stack

- Next.js 14 (App Router) + TypeScript
- Prisma + PostgreSQL
- Tailwind CSS
- Recharts

## Getting Started

Requires a PostgreSQL database — set `DATABASE_URL` in `.env` (see `.env.example`) to a connection string for a local Postgres instance or a hosted one (e.g. Vercel Postgres, Neon).

```bash
npm install
npx prisma migrate dev
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Using it from your phone

The dev/start scripts bind to `0.0.0.0`, so the app is also reachable from other devices on the same Wi-Fi network as your computer — not just `localhost`.

1. Find your computer's local IP address:
   - **Windows**: open Command Prompt and run `ipconfig`, look for "IPv4 Address" (e.g. `192.168.1.42`)
   - **macOS**: System Settings → Wi-Fi → Details, or run `ipconfig getifaddr en0` in Terminal
2. Make sure your phone is connected to the **same Wi-Fi network** as your computer.
3. Start the server (`npm run dev`) and, on your phone's browser, go to `http://<your-ip>:3000` (e.g. `http://192.168.1.42:3000`).
4. If it doesn't load, your computer's firewall may be blocking the connection — on Windows, allow Node.js through **Windows Defender Firewall** for private networks when prompted (or add a rule for port 3000).

This only works while your computer is on and the dev server is running, and only from devices on the same local network. To access the app from anywhere (not just your home Wi-Fi), you'd need to deploy it to a hosting provider (e.g. Vercel) instead.

## Deploying to Vercel

1. **Database**: create a Postgres database (Vercel Postgres or Neon) and copy its connection string.
   - If the provider gives you both a **pooled** and a **direct/unpooled** connection string (Neon and Vercel Postgres both do — e.g. Neon's pooler URL vs its direct URL, or Vercel Postgres's `POSTGRES_PRISMA_URL` vs `POSTGRES_URL_NON_POOLING`), use the **pooled** one for `DATABASE_URL` — serverless functions open many short-lived connections and a pooled connection avoids exhausting the database's connection limit.
2. **Environment variables**: in the Vercel project settings, set:
   - `DATABASE_URL` — the pooled Postgres connection string from step 1
   - `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` — from the LINE Developers Console (Messaging API tab)
   - `ANTHROPIC_API_KEY` — from the Anthropic Console
3. **Run migrations against production** (one-off, from your machine): `prisma migrate deploy` needs a **direct** (non-pooled) connection, since pooled/pgbouncer-style connections don't reliably support the transactions Prisma Migrate uses. Temporarily point `DATABASE_URL` at the direct connection string for this one command:
   ```bash
   DATABASE_URL="<direct-connection-string>" npx prisma migrate deploy
   ```
4. **Deploy** — Vercel auto-detects Next.js, no `vercel.json` needed. `postinstall` already runs `prisma generate` on every install/build.
5. **Update the LINE webhook URL** in the LINE Developers Console to `https://<your-vercel-domain>/api/line/webhook`, then hit "Verify".
6. The LINE webhook route sets `maxDuration = 60` (in `app/api/line/webhook/route.ts`) for slip-image requests — this is within the Hobby plan's limit, but raise it if you're on a plan with a lower default and see timeouts on image messages.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build (also type-checks)
- `npm run start` — run the production build
- `npx prisma studio` — browse/edit the database in a GUI
