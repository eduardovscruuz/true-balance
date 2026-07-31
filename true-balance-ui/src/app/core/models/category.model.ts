export type CategoryType = 'Income' | 'Expense';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
}

export interface CreateCategory {
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
}
