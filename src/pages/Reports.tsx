/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, 
  Download, 
  Calendar, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Users,
  Package,
  FileText,
  ChevronDown
} from 'lucide-react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
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
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { cn } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { startOfToday, startOfWeek, startOfMonth, startOfQuarter, startOfYear, subDays, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';

type DateRange = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export default function Reports() {
  const { invoices, expenses, parties, products, loading } = useBusiness();
  const { profile, currentBusiness } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const currency = profile?.currency || '₹';

  const getDateInterval = () => {
    const now = new Date();
    switch (dateRange) {
      case 'today': return { start: startOfToday(), end: now };
      case 'week': return { start: startOfWeek(now), end: now };
      case 'month': return { start: startOfMonth(now), end: now };
      case 'quarter': return { start: startOfQuarter(now), end: now };
      case 'year': return { start: startOfYear(now), end: now };
      case 'custom': return { start: customStart ? parseISO(customStart) : subDays(now, 30), end: customEnd ? parseISO(customEnd) : now };
      default: return { start: startOfMonth(now), end: now };
    }
  };

  const interval = getDateInterval();

  const filteredData = useMemo(() => {
    const filteredInvoices = invoices.filter(inv => isWithinInterval(parseISO(inv.date), interval));
    const filteredExpenses = expenses.filter(exp => isWithinInterval(parseISO(exp.date), interval));
    
    const sales = filteredInvoices.filter(inv => inv.type === 'sale').reduce((acc, inv) => acc + inv.grandTotal, 0);
    const purchases = filteredInvoices.filter(inv => inv.type === 'purchase').reduce((acc, inv) => acc + inv.grandTotal, 0);
    const totalExpenses = filteredExpenses.reduce((acc, exp) => acc + exp.amount, 0);
    
    return { sales, purchases, totalExpenses, filteredInvoices, filteredExpenses };
  }, [invoices, expenses, interval]);

  const generatePDF = (type: 'sales' | 'expenses' | 'inventory' | 'parties' | 'purchases') => {
    const doc = new jsPDF();
    const businessName = currentBusiness?.name || 'Vyapar-X';
    
    doc.setFontSize(20);
    doc.text(`${businessName} - ${type.toUpperCase()} REPORT`, 14, 22);
    doc.setFontSize(10);
    doc.text(`Period: ${interval.start.toLocaleDateString()} to ${interval.end.toLocaleDateString()}`, 14, 30);
    
    let tableData: any[] = [];
    let tableHeaders: string[] = [];

    if (type === 'sales' || type === 'purchases') {
      const targetType = type === 'sales' ? 'sale' : 'purchase';
      const list = invoices.filter(inv => inv.type === targetType && isWithinInterval(parseISO(inv.date), interval));
      tableHeaders = ['Date', 'Invoice #', 'Party', 'Total', 'Status'];
      tableData = list.map(inv => [
        new Date(inv.date).toLocaleDateString(),
        inv.invoiceNumber,
        parties.find(p => p.id === inv.partyId)?.name || 'Unknown',
        `${currency}${inv.grandTotal}`,
        inv.paymentStatus
      ]);
    } else if (type === 'expenses') {
      const list = expenses.filter(exp => isWithinInterval(parseISO(exp.date), interval));
      tableHeaders = ['Date', 'Category', 'Description', 'Amount', 'Mode'];
      tableData = list.map(exp => [
        new Date(exp.date).toLocaleDateString(),
        exp.category,
        exp.description,
        `${currency}${exp.amount}`,
        exp.paymentMode
      ]);
    } else if (type === 'inventory') {
      tableHeaders = ['Item Name', 'Category', 'Stock', 'Unit', 'Sale Price'];
      tableData = products.map(p => [
        p.name,
        p.category || 'General',
        p.stockQuantity,
        p.unit,
        `${currency}${p.salePrice}`
      ]);
    } else if (type === 'parties') {
      tableHeaders = ['Name', 'Type', 'Phone', 'Balance'];
      tableData = parties.map(p => [
        p.name,
        p.type,
        p.phone,
        `${currency}${p.balance}`
      ]);
    }

    autoTable(doc, {
      head: [tableHeaders],
      body: tableData,
      startY: 35,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`${type}_report_${Date.now()}.pdf`);
    toast.success(`${type} report downloaded`);
  };

  if (loading) return <div className="flex items-center justify-center h-full">Loading reports...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Reports & Analytics</h2>
          <p className="text-muted-foreground">Deep dive into your business performance.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-[180px] border-border-main">
              <Calendar className="w-4 h-4 mr-2 text-primary" />
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-[140px] h-9" />
              <span className="text-text-muted">to</span>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-[140px] h-9" />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-4">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] text-text-muted uppercase font-bold">Total Sales</div>
            <TrendingUp className="w-4 h-4 text-success" />
          </div>
          <div className="text-2xl font-bold text-success">{currency}{(filteredData.sales || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] text-text-muted uppercase font-bold">Total Purchases</div>
            <TrendingDown className="w-4 h-4 text-danger" />
          </div>
          <div className="text-2xl font-bold text-danger">{currency}{(filteredData.purchases || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] text-text-muted uppercase font-bold">Total Expenses</div>
            <Wallet className="w-4 h-4 text-warning" />
          </div>
          <div className="text-2xl font-bold text-warning">{currency}{(filteredData.totalExpenses || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] text-text-muted uppercase font-bold">Net Profit</div>
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <div className={cn(
            "text-2xl font-bold",
            (filteredData.sales - filteredData.purchases - filteredData.totalExpenses) >= 0 ? "text-primary" : "text-danger"
          )}>
            {currency}{(filteredData.sales - filteredData.purchases - filteredData.totalExpenses).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="panel-card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Download className="w-4 h-4 text-primary" /> Download Reports
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button variant="outline" className="justify-start gap-3 h-12 border-border-main" onClick={() => generatePDF('sales')}>
              <FileText className="w-4 h-4 text-success" /> Sales Report PDF
            </Button>
            <Button variant="outline" className="justify-start gap-3 h-12 border-border-main" onClick={() => generatePDF('purchases')}>
              <TrendingDown className="w-4 h-4 text-danger" /> Purchases Report PDF
            </Button>
            <Button variant="outline" className="justify-start gap-3 h-12 border-border-main" onClick={() => generatePDF('expenses')}>
              <Wallet className="w-4 h-4 text-warning" /> Expenses Report PDF
            </Button>
            <Button variant="outline" className="justify-start gap-3 h-12 border-border-main" onClick={() => generatePDF('inventory')}>
              <Package className="w-4 h-4 text-primary" /> Inventory Report PDF
            </Button>
            <Button variant="outline" className="justify-start gap-3 h-12 border-border-main" onClick={() => generatePDF('parties')}>
              <Users className="w-4 h-4 text-indigo-500" /> Parties Report PDF
            </Button>
          </div>
        </div>

        <div className="panel-card">
          <h3 className="text-base font-bold mb-6">Quick Insights</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-border-main">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-success/10 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-success" />
                </div>
                <div>
                  <div className="text-xs font-bold">Top Selling Item</div>
                  <div className="text-[11px] text-text-muted">Most quantity sold</div>
                </div>
              </div>
              <div className="text-sm font-bold">Wireless Mouse</div>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-border-main">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-xs font-bold">Top Customer</div>
                  <div className="text-[11px] text-text-muted">Highest billing value</div>
                </div>
              </div>
              <div className="text-sm font-bold">Rahul Sharma</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
