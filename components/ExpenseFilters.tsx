"use client";

import { CATEGORIES } from "@/lib/categories";

export interface Filters {
  category: string;
  from: string;
  to: string;
}

interface ExpenseFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export default function ExpenseFilters({
  filters,
  onChange,
}: ExpenseFiltersProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-3 items-end">
      <div>
        <label className="block text-sm text-slate-600 mb-1">Category</label>
        <select
          value={filters.category}
          onChange={(e) => onChange({ ...filters, category: e.target.value })}
          className="border border-slate-300 rounded px-3 py-2"
        >
          <option value="All">All</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm text-slate-600 mb-1">From</label>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => onChange({ ...filters, from: e.target.value })}
          className="border border-slate-300 rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm text-slate-600 mb-1">To</label>
        <input
          type="date"
          value={filters.to}
          onChange={(e) => onChange({ ...filters, to: e.target.value })}
          className="border border-slate-300 rounded px-3 py-2"
        />
      </div>
      {(filters.category !== "All" || filters.from || filters.to) && (
        <button
          onClick={() => onChange({ category: "All", from: "", to: "" })}
          className="text-sm text-slate-600 underline px-2 py-2"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
