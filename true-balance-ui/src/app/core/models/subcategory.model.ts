export interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
}

export interface CreateSubcategory {
  categoryId: string;
  name: string;
}
