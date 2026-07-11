"use client";

import { useCallback, useEffect, useState } from "react";
import { Expense, ExpenseSummary } from "@/lib/types";
import { formatAmount } from "@/lib/format";
import { downloadExpensesCsv } from "@/lib/csv";
import ExpenseForm from "@/components/ExpenseForm";
import ExpenseFilters, { Filters } from "@/components/ExpenseFilters";
import ExpenseList from "@/components/ExpenseList";
import SummaryCards from "@/components/SummaryCards";
import CategoryChart from "@/components/CategoryChart";
import TrendChart from "@/components/TrendChart";
import ConfirmDialog from "@/components/ConfirmDialog";

const PAGE_SIZE = 10;
const EXPORT_PAGE_SIZE = 100;

const EMPTY_SUMMARY: ExpenseSummary = {
  total: 0,
  thisMonth: 0,
  topCategory: null,
  byCategory: [],
  monthlyTrend: [],
};

export default function Dashboard() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<ExpenseSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  const [filters, setFilters] = useState<Filters>({
    category: "All",
    from: "",
    to: "",
  });

  const buildParams = useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams();
      if (filters.category !== "All") params.set("category", filters.category);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (extra) {
        for (const [key, value] of Object.entries(extra)) params.set(key, value);
      }
      return params;
    },
    [filters]
  );

  // The list (current page only) and the summary (totals/charts over every
  // matching row) are separate, lightweight server-side queries instead of
  // fetching the entire filtered table and aggregating it in the browser.
  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const [listRes, summaryRes] = await Promise.all([
      fetch(
        `/api/expenses?${buildParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        }).toString()}`
      ),
      fetch(`/api/expenses/summary?${buildParams().toString()}`),
    ]);
    const listData = await listRes.json();
    const summaryData = await summaryRes.json();
    setExpenses(listData.data);
    setTotal(listData.total);
    setSummary(summaryData);
    setLoading(false);

    const totalPages = Math.max(1, Math.ceil(listData.total / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [buildParams, page]);

  useEffect(() => {
    fetchExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchExpenses]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const handleSave = async (data: {
    amount: number;
    category: string;
    description: string;
    date: string;
  }) => {
    const url = editingExpense
      ? `/api/expenses/${editingExpense.id}`
      : "/api/expenses";
    const method = editingExpense ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Failed to save expense");
    }

    setEditingExpense(null);
    // Jump back to page 1 so the newly added/edited row is visible; if
    // already there, page won't change on its own so fetch explicitly.
    if (page === 1) {
      await fetchExpenses();
    } else {
      setPage(1);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (editingExpense?.id === id) setEditingExpense(null);
    await fetchExpenses();
  };

  // CSV export needs every matching row, not just the current page — walk
  // pages of the same filtered query instead of relying on state.
  const handleExportCsv = async () => {
    const all: Expense[] = [];
    let exportPage = 1;
    for (;;) {
      const params = buildParams({
        page: String(exportPage),
        pageSize: String(EXPORT_PAGE_SIZE),
      });
      const res = await fetch(`/api/expenses?${params.toString()}`);
      const data = await res.json();
      all.push(...data.data);
      if (data.data.length === 0 || all.length >= data.total) break;
      exportPage += 1;
    }
    downloadExpensesCsv(all);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold">Expense Tracker</h1>
        <p className="text-slate-500">Keep tabs on where your money goes.</p>
      </header>

      <SummaryCards summary={summary} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CategoryChart data={summary.byCategory} />
        <TrendChart data={summary.monthlyTrend} />
      </div>

      <ExpenseForm
        editingExpense={editingExpense}
        onSave={handleSave}
        onCancelEdit={() => setEditingExpense(null)}
      />

      <ExpenseFilters filters={filters} onChange={setFilters} />

      {loading ? (
        <p className="text-slate-500 text-center py-8">Loading…</p>
      ) : (
        <ExpenseList
          expenses={expenses}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          onEdit={setEditingExpense}
          onDeleteRequest={setPendingDelete}
          onExportCsv={handleExportCsv}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete expense?"
        description={
          pendingDelete
            ? `${pendingDelete.category} · ${formatAmount(pendingDelete.amount)}${
                pendingDelete.description ? ` · ${pendingDelete.description}` : ""
              }`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
