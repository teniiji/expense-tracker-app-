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

const toIso = (d: Date) => d.toISOString().slice(0, 10);

const DATE_PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  {
    label: "This month",
    range: () => {
      const now = new Date();
      return {
        from: toIso(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: toIso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    },
  },
  {
    label: "Last month",
    range: () => {
      const now = new Date();
      return {
        from: toIso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toIso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    },
  },
  {
    label: "Last 7 days",
    range: () => {
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: toIso(from), to: toIso(now) };
    },
  },
];

export default function ExpenseFilters({
  filters,
  onChange,
}: ExpenseFiltersProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange({ ...filters, ...preset.range() })}
            className="text-xs px-3 py-1.5 border border-slate-300 rounded-full hover:bg-slate-50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-full sm:w-auto">
          <label className="block text-sm text-slate-600 mb-1">Category</label>
          <select
            value={filters.category}
            onChange={(e) => onChange({ ...filters, category: e.target.value })}
            className="w-full sm:w-auto border border-slate-300 rounded px-3 py-2"
          >
            <option value="All">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-sm text-slate-600 mb-1">From</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => onChange({ ...filters, from: e.target.value })}
            className="w-full sm:w-auto border border-slate-300 rounded px-3 py-2"
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-sm text-slate-600 mb-1">To</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => onChange({ ...filters, to: e.target.value })}
            className="w-full sm:w-auto border border-slate-300 rounded px-3 py-2"
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
    </div>
  );
}
