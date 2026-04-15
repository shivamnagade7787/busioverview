/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  IndianRupee,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
  Receipt,
  Users,
  Package
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const { invoices, parties, products, expenses, bankAccounts, loading } = useBusiness();
  const { profile } = useAuth();
  const currency = profile?.currency || '₹';

  const stats = useMemo(() => {
    const totalSales = invoices
      .filter(i => i.type === 'sale')
      .reduce((acc, i) => acc + i.grandTotal, 0);
    
    const totalPurchases = invoices
      .filter(i => i.type === 'purchase')
      .reduce((acc, i) => acc + i.grandTotal, 0);
    
    const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
    
    const receivable = parties
      .filter(p => p.type === 'customer' && p.balance > 0)
      .reduce((acc, p) => acc + p.balance, 0);
    
    const payable = parties
      .filter(p => p.type === 'supplier' && p.balance < 0)
      .reduce((acc, p) => acc + Math.abs(p.balance), 0);
    
    const bankBalance = bankAccounts.reduce((acc, b) => acc + b.balance, 0);
    
    const netProfit = totalSales - totalPurchases - totalExpenses;

    return { totalSales, totalPurchases, totalExpenses, receivable, payable, bankBalance, netProfit };
  }, [invoices, parties, expenses, bankAccounts]);

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(date => {
      const daySales = invoices
        .filter(i => i.type === 'sale' && i.date === date)
        .reduce((acc, i) => acc + i.grandTotal, 0);
      const dayPurchases = invoices
        .filter(i => i.type === 'purchase' && i.date === date)
        .reduce((acc, i) => acc + i.grandTotal, 0);
      return {
        date: new Date(date).toLocaleDateString('en-IN', { weekday: 'short' }),
        sales: daySales,
        purchases: dayPurchases
      };
    });
  }, [invoices]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-text-muted font-medium">Loading your business data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Business Overview</h2>
          <p className="text-muted-foreground">Real-time insights into your sales, credit, and inventory.</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-border-main shadow-sm">
          <div className="px-3 py-1.5 text-xs font-bold text-primary bg-primary-light rounded-md">Last 30 Days</div>
          <div className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-main cursor-pointer">This Year</div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <div className="stat-card">
          <div className="flex justify-between items-start mb-2">
            <div className="text-[12px] text-text-muted uppercase tracking-wider font-bold">Total Sales</div>
            <div className="p-1.5 bg-primary-light rounded-lg text-primary">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-text-main">{currency}{(stats.totalSales || 0).toLocaleString()}</div>
          <div className="text-[11px] mt-2 flex items-center gap-1 text-success font-medium">
            <ArrowUpRight className="w-3 h-3" /> +12.5% vs last month
          </div>
        </div>

        <div className="stat-card">
          <div className="flex justify-between items-start mb-2">
            <div className="text-[12px] text-text-muted uppercase tracking-wider font-bold">Total Expenses</div>
            <div className="p-1.5 bg-danger/10 rounded-lg text-danger">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-text-main">{currency}{(stats.totalExpenses || 0).toLocaleString()}</div>
          <div className="text-[11px] mt-2 flex items-center gap-1 text-danger font-medium">
            <ArrowDownRight className="w-3 h-3" /> -2.3% vs last month
          </div>
        </div>

        <div className="stat-card">
          <div className="flex justify-between items-start mb-2">
            <div className="text-[12px] text-text-muted uppercase tracking-wider font-bold">To Receive</div>
            <div className="p-1.5 bg-success/10 rounded-lg text-success">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-success">{currency}{(stats.receivable || 0).toLocaleString()}</div>
          <div className="text-[11px] mt-2 text-text-muted font-medium">
            From {parties.filter(p => p.type === 'customer' && p.balance > 0).length} customers
          </div>
        </div>

        <div className="stat-card">
          <div className="flex justify-between items-start mb-2">
            <div className="text-[12px] text-text-muted uppercase tracking-wider font-bold">To Pay</div>
            <div className="p-1.5 bg-amber-100 rounded-lg text-amber-700">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-danger">{currency}{(stats.payable || 0).toLocaleString()}</div>
          <div className="text-[11px] mt-2 text-text-muted font-medium">
            To {parties.filter(p => p.type === 'supplier' && p.balance < 0).length} suppliers
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <div className="panel-card col-span-4 flex flex-col">
          <div className="text-base font-bold mb-6 flex justify-between items-center">
            Sales vs Purchases
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-primary"></div>
                <span className="text-[11px] font-bold text-text-muted uppercase">Sales</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                <span className="text-[11px] font-bold text-text-muted uppercase">Purchases</span>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} 
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Area type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                <Area type="monotone" dataKey="purchases" stroke="#cbd5e1" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel-card col-span-3">
          <div className="text-base font-bold mb-6 flex justify-between items-center">
            Low Stock Alerts
            <span className="px-2 py-0.5 bg-danger/10 text-danger text-[10px] font-bold rounded-full uppercase">Action Required</span>
          </div>
          <div className="space-y-4">
            {products.filter(p => p.stockQuantity <= (p.lowStockAlert || 0)).slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border-main hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-text-muted">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-text-main">{p.name}</div>
                    <div className="text-[10px] text-text-muted uppercase font-bold">{p.category || 'General'}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-danger">{p.stockQuantity} {p.unit}</div>
                  <div className="text-[10px] text-text-muted uppercase font-bold">In Stock</div>
                </div>
              </div>
            ))}
            {products.filter(p => p.stockQuantity <= (p.lowStockAlert || 0)).length === 0 && (
              <div className="text-center py-12">
                <Package className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-text-muted">All stock levels are healthy.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="panel-card">
          <div className="text-base font-bold mb-6 flex justify-between items-center">
            Recent Invoices
            <button className="text-[11px] text-primary font-bold uppercase tracking-wider hover:underline">View All</button>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border-main">
                <TableHead className="h-10 text-[10px] font-bold uppercase tracking-wider text-text-muted">Invoice</TableHead>
                <TableHead className="h-10 text-[10px] font-bold uppercase tracking-wider text-text-muted">Party</TableHead>
                <TableHead className="h-10 text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.slice(0, 5).map((inv) => (
                <TableRow key={inv.id} className="border-slate-50">
                  <TableCell className="py-3">
                    <div className="flex flex-col">
                      <span className="text-[13px] font-bold">{inv.invoiceNumber}</span>
                      <span className="text-[10px] text-text-muted uppercase font-bold">{inv.type}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 text-[13px] font-medium">
                    {parties.find(p => p.id === inv.partyId)?.name || 'Unknown'}
                  </TableCell>
                  <TableCell className="py-3 text-right text-[13px] font-bold text-text-main">
                    {currency}{(inv.grandTotal || 0).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="panel-card">
          <div className="text-base font-bold mb-6 flex justify-between items-center">
            Cash & Bank Summary
            <button className="text-[11px] text-primary font-bold uppercase tracking-wider hover:underline">Manage</button>
          </div>
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-primary-light rounded-xl border border-primary/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-primary shadow-sm">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] text-primary font-bold uppercase tracking-wider">Cash in Hand</div>
                  <div className="text-xl font-bold text-primary">{currency}{(stats.bankBalance || 0).toLocaleString()}</div>
                </div>
              </div>
              <ArrowUpRight className="w-5 h-5 text-primary opacity-50" />
            </div>

            <div className="space-y-3">
              <div className="text-[10px] text-text-muted uppercase font-bold tracking-widest px-1">Bank Accounts</div>
              {bankAccounts.map(acc => (
                <div key={acc.id} className="flex items-center justify-between p-3 rounded-lg border border-border-main">
                  <div className="text-sm font-bold text-text-main">{acc.bankName}</div>
                  <div className="text-sm font-bold text-text-main">{currency}{(acc.balance || 0).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
