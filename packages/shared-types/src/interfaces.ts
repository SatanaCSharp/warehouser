import type { UserRole, MovementType } from "./enums.js";

export interface IUser {
  _id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface IProduct {
  _id: string;
  name: string;
  sku: string;
  description?: string;
  unit: string;
  createdAt: string;
}

export interface ILocation {
  _id: string;
  name: string;
  code: string;
  description?: string;
}

export interface IStockMovement {
  _id: string;
  product: string;
  fromLocation?: string;
  toLocation?: string;
  type: MovementType;
  quantity: number;
  performedBy: string;
  note?: string;
  createdAt: string;
}
