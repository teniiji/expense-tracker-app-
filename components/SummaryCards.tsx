import { Expense } from "@/lib/types";

interface SummaryCardsProps {
  expenses: Expense[];
}

const formatAmount = (amount: number) =>
  amount.toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function SummaryCards({ expenses }: SummaryCardsProps) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const now = new Date();
  const thisMonth = expenses
    .filter((e) => {
      const d = new Date(e.date);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      );
    })
    .reduce((sum, e) => sum + e.amount, 0);

  const topCategory = (() => {
    const totals = new Map<string, number>();
    for (const e of expenses) {
      totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
    }
    let best: [string, number] | null = null;
    for (const entry of totals) {
      if (!best || entry[1] > best[1]) best = entry;
    }
    return best;
  })();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm text-slate-500">Total spend</p>
        <p className="text-2xl font-semibold">{formatAmount(total)}</p>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm text-slate-500">This month</p>
        <p className="text-2xl font-semibold">{formatAmount(thisMonth)}</p>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-sm text-slate-500">Top category</p>
        <p className="text-2xl font-semibold">
          {topCategory ? topCategory[0] : "—"}
        </p>
      </div>
    </div>
  );
}
