export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  createdAt: string;
}

export interface ExpenseSummary {
  total: number;
  thisMonth: number;
  topCategory: string | null;
  byCategory: { category: string; total: number }[];
  monthlyTrend: { month: string; total: number }[];
}
