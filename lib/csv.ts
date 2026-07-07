import { Expense } from "./types";

const escapeCsvField = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function downloadExpensesCsv(expenses: Expense[]) {
  const header = ["Date", "Category", "Description", "Amount"];
  const rows = expenses.map((e) => [
    e.date.slice(0, 10),
    e.category,
    e.description ?? "",
    e.amount.toFixed(2),
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((field) => escapeCsvField(String(field))).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
