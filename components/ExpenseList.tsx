"use client";

import { Expense } from "@/lib/types";
import { formatAmount } from "@/lib/format";

interface ExpenseListProps {
  expenses: Expense[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onEdit: (expense: Expense) => void;
  onDeleteRequest: (expense: Expense) => void;
  onExportCsv: () => void;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const formatUser = (user: Expense["user"]) =>
  user ? user.nickname ?? user.displayName ?? "LINE user" : "Web";

export default function ExpenseList({
  expenses,
  total,
  page,
  pageSize,
  onPageChange,
  onEdit,
  onDeleteRequest,
  onExportCsv,
}: ExpenseListProps) {
  if (total === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-slate-500">
        No expenses yet. Add one above to get started.
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
        <p className="text-sm text-slate-500">
          Showing {start + 1}–{Math.min(start + pageSize, total)} of {total}
        </p>
        <button
          type="button"
          onClick={onExportCsv}
          className="text-sm text-slate-600 border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2">User</th>
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
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                  {formatUser(expense.user)}
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
                    onClick={() => onDeleteRequest(expense)}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
            className="text-sm px-3 py-1.5 border border-slate-300 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <p className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </p>
          <button
            type="button"
            disabled={page === totalPages}
            onClick={() => onPageChange(page + 1)}
            className="text-sm px-3 py-1.5 border border-slate-300 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
