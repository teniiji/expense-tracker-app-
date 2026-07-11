export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  createdAt: string;
  user: { displayName: string | null; nickname: string | null } | null;
}

export interface ExpenseSummary {
  total: number;
  thisMonth: number;
  topCategory: string | null;
  byCategory: { category: string; total: number }[];
  monthlyTrend: { month: string; total: number }[];
}

export interface LineUser {
  id: string;
  displayName: string | null;
  nickname: string | null;
  createdAt: string;
}
