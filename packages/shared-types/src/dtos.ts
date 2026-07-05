import type { MovementType } from "./enums.js";

export interface CreateProductDto {
  name: string;
  sku: string;
  description?: string;
  unit: string;
}

export interface UpdateProductDto {
  name?: string;
  description?: string;
  unit?: string;
}

export interface CreateLocationDto {
  name: string;
  code: string;
  description?: string;
}

export interface UpdateLocationDto {
  name?: string;
  description?: string;
}

export interface StockMovementDto {
  productId: string;
  fromLocationId?: string;
  toLocationId?: string;
  type: MovementType;
  quantity: number;
  note?: string;
}

export interface PaginationDto {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
