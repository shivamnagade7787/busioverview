/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from './AuthContext';
import { Party, Product, Invoice, Expense, BankAccount, LedgerEntry } from '@/src/types';

interface BusinessContextType {
  parties: Party[];
  products: Product[];
  invoices: Invoice[];
  expenses: Expense[];
  bankAccounts: BankAccount[];
  ledger: LedgerEntry[];
  loading: boolean;
}

const BusinessContext = createContext<BusinessContextType>({
  parties: [],
  products: [],
  invoices: [],
  expenses: [],
  bankAccounts: [],
  ledger: [],
  loading: true,
});

export const BusinessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isAuthReady } = useAuth();
  const [parties, setParties] = useState<Party[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const businessId = profile?.currentBusinessId;

  useEffect(() => {
    if (!isAuthReady || !user || !businessId) {
      setParties([]);
      setProducts([]);
      setInvoices([]);
      setExpenses([]);
      setBankAccounts([]);
      setLedger([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const qParties = query(collection(db, 'parties'), where('businessId', '==', businessId), orderBy('createdAt', 'desc'));
    const qProducts = query(collection(db, 'products'), where('businessId', '==', businessId), orderBy('createdAt', 'desc'));
    const qInvoices = query(collection(db, 'invoices'), where('businessId', '==', businessId), orderBy('date', 'desc'));
    const qExpenses = query(collection(db, 'expenses'), where('businessId', '==', businessId), orderBy('date', 'desc'));
    const qBankAccounts = query(collection(db, 'bank_accounts'), where('businessId', '==', businessId), orderBy('createdAt', 'desc'));
    const qLedger = query(collection(db, 'ledger'), where('businessId', '==', businessId), orderBy('date', 'desc'));

    const unsubscribeParties = onSnapshot(qParties, (snapshot) => {
      setParties(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Party)));
    }, (error) => console.error("Parties snapshot error:", error));

    const unsubscribeProducts = onSnapshot(qProducts, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => console.error("Products snapshot error:", error));

    const unsubscribeInvoices = onSnapshot(qInvoices, (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
    }, (error) => console.error("Invoices snapshot error:", error));

    const unsubscribeExpenses = onSnapshot(qExpenses, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    }, (error) => console.error("Expenses snapshot error:", error));

    const unsubscribeLedger = onSnapshot(qLedger, (snapshot) => {
      setLedger(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LedgerEntry)));
    }, (error) => console.error("Ledger snapshot error:", error));

    const unsubscribeBankAccounts = onSnapshot(qBankAccounts, (snapshot) => {
      setBankAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BankAccount)));
      setLoading(false);
    }, (error) => {
      console.error("BankAccounts snapshot error:", error);
      setLoading(false);
    });

    return () => {
      unsubscribeParties();
      unsubscribeProducts();
      unsubscribeInvoices();
      unsubscribeExpenses();
      unsubscribeBankAccounts();
      unsubscribeLedger();
    };
  }, [user, isAuthReady, businessId]);

  return (
    <BusinessContext.Provider value={{ parties, products, invoices, expenses, bankAccounts, ledger, loading }}>
      {children}
    </BusinessContext.Provider>
  );
};

export const useBusiness = () => useContext(BusinessContext);
