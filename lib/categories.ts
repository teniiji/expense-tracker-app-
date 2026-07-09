export const CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Loan",
  "DebtRepayment",
  "Investment",
  "Savings",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS: Record<Category, string> = {
  Food: "#f97316",
  Transport: "#3b82f6",
  Shopping: "#a855f7",
  Bills: "#ef4444",
  Entertainment: "#ec4899",
  Health: "#22c55e",
  Loan: "#eab308",
  DebtRepayment: "#f43f5e",
  Investment: "#14b8a6",
  Savings: "#0ea5e9",
  Other: "#6b7280",
};
