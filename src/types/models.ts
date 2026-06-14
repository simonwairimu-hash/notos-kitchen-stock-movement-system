import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'store_user';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  assignedStoreId: string | null; // null for admins
  status: 'active' | 'suspended';
  phone?: string;
  lastLoginAt?: Timestamp;
  password?: string;
  createdAt: Timestamp;
}

export interface Store {
  id: string;
  name: string;
  location: string;
  description?: string;
  status?: 'active' | 'disabled';
  createdAt: Timestamp;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  storeId?: string | null;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  storeId?: string | null;
}

export interface Unit {
  id: string;
  name: string;
  abbreviation: string; // e.g. "kg", "l", "pc"
  storeId?: string | null;
}

// Global Item Catalog definition
export interface CatalogItem {
  id: string;
  name: string;
  categoryId: string;
  departmentId?: string | null;
  unitId: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Store-specific inventory levels & counts
export interface InventoryItem {
  id: string; // `${storeId}_${itemId}`
  storeId: string;
  itemId: string;
  
  // Denormalized fields for quick views
  itemName: string;
  categoryId: string;
  departmentId?: string | null;
  unitId: string;

  // Formula Buckets
  openingStock: number;
  received: number;
  issued: number;
  damaged: number;
  transferIn: number;
  transferOut: number;
  quantity: number; // Remaining Stock = openingStock + received - issued - damaged + transferIn - transferOut

  minStockLevel: number;
  costPrice: number;
  sellingPrice?: number;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  currentWeightedAverageCost?: number;
  lastPurchaseCost?: number;
  lastPurchaseDate?: Timestamp | null;
  inventoryValue?: number;
  minimumStock?: number;
}

export type TransactionType = 'IN' | 'OUT' | 'TRANSFER';
export type TransactionReason = 'opening' | 'receive' | 'issue' | 'damage' | 'transfer_in' | 'transfer_out' | 'adjustment';

export interface Transaction {
  id: string;
  storeId: string;
  itemId: string;
  itemName: string; // snapshotted
  type: TransactionType;
  quantity: number; // always positive
  reason: TransactionReason;
  referenceId?: string | null; // e.g. requisitionId or targetStoreId
  departmentId?: string | null;
  toStoreId?: string | null;
  fromStoreId?: string | null;
  notes?: string | null;
  performedBy: string; // user uid
  performedByName: string;
  createdAt: Timestamp;
  receivedCost?: number;
  oldAverageCost?: number;
  newWeightedAverageCost?: number;
  supplierName?: string | null;
  invoiceNumber?: string | null;
}

export type RequisitionStatus = 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled';

export interface RequisitionItem {
  itemId: string;
  name: string;
  requestedQty: number;
  fulfilledQty?: number;
}

export interface Requisition {
  id: string;
  fromStoreId: string; // requesting store
  toStoreId: string; // supplying store
  status: RequisitionStatus;
  items: RequisitionItem[];
  requestedBy: string; // user uid
  requestedByName: string;
  approvedBy?: string | null;
  approvedByName?: string | null;
  rejectionReason?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: string;
  storeId: string | null;
  details: string;
  ipAddress: string;
  timestamp: Timestamp;
}
