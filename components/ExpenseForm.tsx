"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import { Expense } from "@/lib/types";

interface ExpenseFormProps {
  editingExpense: Expense | null;
  onSave: (data: {
    amount: number;
    category: string;
    description: string;
    date: string;
  }) => Promise<void>;
  onCancelEdit: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function ExpenseForm({
  editingExpense,
  onSave,
  onCancelEdit,
}: ExpenseFormProps) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingExpense) {
      setAmount(String(editingExpense.amount));
      setCategory(editingExpense.category);
      setDescription(editingExpense.description ?? "");
      setDate(editingExpense.date.slice(0, 10));
    } else {
      setAmount("");
      setCategory(CATEGORIES[0]);
      setDescription("");
      setDate(todayIso());
    }
  }, [editingExpense]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }
    if (!date) {
      setError("Enter a date");
      return;
    }

    setSubmitting(true);
    try {
      await onSave({ amount: parsedAmount, category, description, date });
      if (!editingExpense) {
        setAmount("");
        setDescription("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-lg shadow p-4 space-y-3"
    >
      <h2 className="font-semibold text-lg">
        {editingExpense ? "Edit expense" : "Add expense"}
      </h2>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-slate-600 mb-1">Amount</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2"
            placeholder="0.00"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">
          Description (optional)
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-slate-300 rounded px-3 py-2"
          placeholder="e.g. Groceries"
        />
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full border border-slate-300 rounded px-3 py-2"
          required
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-slate-900 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {editingExpense ? "Save changes" : "Add expense"}
        </button>
        {editingExpense && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="border border-slate-300 rounded px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
