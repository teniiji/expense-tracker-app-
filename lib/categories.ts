export const CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
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
  Other: "#6b7280",
};
