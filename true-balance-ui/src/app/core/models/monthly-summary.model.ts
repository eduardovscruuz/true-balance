import { CategoryType } from './category.model';

export interface MonthlySummary {
  id: string;
  month: number;
  year: number;
  categoryId: string;
  subcategoryId: string | null;
  totalAmount: number;
  type: CategoryType;
}
