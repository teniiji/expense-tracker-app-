# Expense Tracker

A simple full-stack expense tracker: add, edit, delete, and filter expenses, with a dashboard showing total spend, spend by category, and a monthly trend chart.

## Stack

- Next.js 14 (App Router) + TypeScript
- Prisma + SQLite (local file database, no external services required)
- Tailwind CSS
- Recharts

## Getting Started

```bash
npm install
npx prisma migrate dev
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

The SQLite database file is created at `prisma/dev.db` on first migration.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build (also type-checks)
- `npm run start` — run the production build
- `npx prisma studio` — browse/edit the database in a GUI
