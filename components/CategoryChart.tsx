"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Expense } from "@/lib/types";
import { CATEGORY_COLORS, Category } from "@/lib/categories";
import { formatAmount } from "@/lib/format";

interface CategoryChartProps {
  expenses: Expense[];
}

export default function CategoryChart({ expenses }: CategoryChartProps) {
  const totals = new Map<string, number>();
  for (const e of expenses) {
    totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
  }
  const data = Array.from(totals.entries()).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="font-semibold mb-2">Spend by category</h2>
      {data.length === 0 ? (
        <p className="text-slate-500 text-sm py-10 text-center">
          No data to display
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              label={(entry) => entry.name}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={CATEGORY_COLORS[entry.name as Category] ?? "#94a3b8"}
                />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatAmount(value)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
