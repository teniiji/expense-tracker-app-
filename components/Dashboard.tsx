"use client";

import { useCallback, useEffect, useState } from "react";
import { Expense } from "@/lib/types";
import ExpenseForm from "@/components/ExpenseForm";
import ExpenseFilters, { Filters } from "@/components/ExpenseFilters";
import ExpenseList from "@/components/ExpenseList";
import SummaryCards from "@/components/SummaryCards";
import CategoryChart from "@/components/CategoryChart";
import TrendChart from "@/components/TrendChart";

export default function Dashboard() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filters, setFilters] = useState<Filters>({
    category: "All",
    from: "",
    to: "",
  });

  const fetchExpenses = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.category !== "All") params.set("category", filters.category);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);

    const res = await fetch(`/api/expenses?${params.toString()}`);
    const data = await res.json();
    setExpenses(data);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

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
    await fetchExpenses();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (editingExpense?.id === id) setEditingExpense(null);
    await fetchExpenses();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Expense Tracker</h1>
        <p className="text-slate-500">Keep tabs on where your money goes.</p>
      </header>

      <SummaryCards expenses={expenses} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CategoryChart expenses={expenses} />
        <TrendChart expenses={expenses} />
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
          onEdit={setEditingExpense}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
