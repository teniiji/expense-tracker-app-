export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  createdAt: string;
}
