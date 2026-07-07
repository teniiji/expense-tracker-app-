"use client";

import { Expense } from "@/lib/types";
import { formatAmount } from "@/lib/format";

interface ExpenseListProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export default function ExpenseList({
  expenses,
  onEdit,
  onDelete,
}: ExpenseListProps) {
  if (expenses.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-slate-500">
        No expenses yet. Add one above to get started.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead className="bg-slate-100 text-slate-600 text-left">
          <tr>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Category</th>
            <th className="px-4 py-2">Description</th>
            <th className="px-4 py-2 text-right">Amount</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr key={expense.id} className="border-t border-slate-100">
              <td className="px-4 py-2 whitespace-nowrap">
                {formatDate(expense.date)}
              </td>
              <td className="px-4 py-2">{expense.category}</td>
              <td className="px-4 py-2 text-slate-500">
                {expense.description || "—"}
              </td>
              <td className="px-4 py-2 text-right font-medium">
                {formatAmount(expense.amount)}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-right space-x-3">
                <button
                  onClick={() => onEdit(expense)}
                  className="text-slate-600 hover:underline py-1"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(expense.id)}
                  className="text-red-600 hover:underline py-1"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
