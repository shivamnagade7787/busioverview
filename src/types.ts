/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PartyType = 'customer' | 'supplier';
export type InvoiceType = 'sale' | 'purchase' | 'estimate' | 'proforma';
export type PaymentMode = 'cash' | 'bank' | 'upi';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface Business {
  id: string;
  name: string;
  gstNumber?: string;
  address?: string;
  phone?: string;
  currency: string;
  upiId?: string;
  logoUrl?: string;
  invoiceTemplate?: 'classic' | 'modern' | 'compact' | 'professional';
  language?: 'en' | 'mr';
}

export interface UserProfile {
  uid: string;
  email: string;
  currentBusinessId: string;
  businesses: Business[];
  businessIds: string[];
  darkMode?: boolean;
  createdAt: string;
}

export interface Party {
  id: string;
  userId: string;
  businessId: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  gstNumber?: string;
  type: PartyType;
  balance: number; // Positive for receivable, negative for payable
  createdAt: string;
}

export interface Product {
  id: string;
  userId: string;
  businessId: string;
  name: string;
  hsnCode?: string;
  gstRate?: number;
  purchasePrice?: number;
  salePrice: number;
  stockQuantity: number;
  lowStockAlert?: number;
  category?: string;
  unit?: string;
  reminderEnabled?: boolean;
  reminderDate?: string;
  createdAt: string;
}

export interface InvoiceItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  gstRate: number;
  discount: number;
  total: number;
}

export interface Invoice {
  id: string;
  userId: string;
  businessId: string;
  partyId: string;
  invoiceNumber: string;
  date: string;
  type: InvoiceType;
  items: InvoiceItem[];
  subTotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  paymentMode: PaymentMode;
  notes?: string;
  billImageUrl?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  userId: string;
  businessId: string;
  category: string;
  amount: number;
  date: string;
  paymentMode: PaymentMode;
  notes?: string;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  userId: string;
  businessId: string;
  bankName: string;
  accountNumber?: string;
  ifscCode?: string;
  balance: number;
  createdAt: string;
}

export interface DashboardStats {
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  cashInHand: number;
  bankBalance: number;
  receivable: number;
  payable: number;
  netProfit: number;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  businessId: string;
  partyId: string;
  type: 'credit' | 'debit';
  amount: number;
  date: string;
  description?: string;
  createdAt: string;
}
