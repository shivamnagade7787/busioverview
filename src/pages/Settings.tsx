/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { db } from '@/src/lib/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  User, 
  Building2, 
  Coins, 
  MapPin, 
  Phone, 
  FileText, 
  QrCode, 
  Languages, 
  Layout, 
  Copy,
  Settings as SettingsIcon,
  Plus,
  Trash2,
  Info,
  ChevronRight,
  Database,
  ArrowRightLeft,
  Download,
  Upload,
  ShieldCheck
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { convertToNumeric } from '@/src/lib/mappingService';
import { InventorySettings } from '../types';

export default function Settings() {
  const { user, profile, currentBusiness } = useAuth();
  const [loading, setLoading] = useState(false);
  
  // Inventory Settings State
  const [invSettings, setInvSettings] = useState<InventorySettings>(
    currentBusiness?.inventorySettings || {
      enableAlphanumericCodes: false,
      enableAlphaToNumberMapping: false,
      conversionLogic: 'prefix',
      mappings: {},
      enforcePositive: true,
      strictMode: false,
      allowDecimals: true
    }
  );

  const [newMappingCode, setNewMappingCode] = useState('');
  const [newMappingValue, setNewMappingValue] = useState('');
  const [testInput, setTestInput] = useState('');

  const addMapping = () => {
    if (!newMappingCode || !newMappingValue) {
      toast.error('Enter both code and value');
      return;
    }
    if (/[0-9]/.test(newMappingCode)) {
      toast.error('Code should only contain alphabets');
      return;
    }
    
    setInvSettings(prev => ({
      ...prev,
      mappings: {
        ...prev.mappings,
        [newMappingCode.toUpperCase()]: Number(newMappingValue)
      }
    }));
    setNewMappingCode('');
    setNewMappingValue('');
  };

  const removeMapping = (code: string) => {
    const newMappings = { ...invSettings.mappings };
    delete newMappings[code];
    setInvSettings(prev => ({ ...prev, mappings: newMappings }));
  };

  const handleExportMappings = () => {
    const data = JSON.stringify(invSettings.mappings, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_mappings_${currentBusiness?.name || 'export'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Mappings exported successfully');
  };

  const handleImportMappings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (typeof json !== 'object') throw new Error('Invalid format');
        
        // Basic validation: all values should be numbers
        const cleaned: Record<string, number> = {};
        Object.entries(json).forEach(([k, v]) => {
          if (typeof v === 'number') cleaned[k.toUpperCase()] = v;
        });

        setInvSettings(prev => ({
          ...prev,
          mappings: { ...prev.mappings, ...cleaned }
        }));
        toast.success(`Imported ${Object.keys(cleaned).length} mappings`);
      } catch (err) {
        toast.error('Failed to import mappings. Use a valid JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleUpdateBusiness = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !profile || !currentBusiness) return;

    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const currency = formData.get('currency') as string;
    const gstNumber = formData.get('gstNumber') as string;
    const address = formData.get('address') as string;
    const phone = formData.get('phone') as string;
    const upiId = formData.get('upiId') as string;
    const invoiceTemplate = formData.get('invoiceTemplate') as any;
    const language = formData.get('language') as any;

    try {
      const updatedBusiness = { 
        ...currentBusiness,
        name, currency, gstNumber, address, phone, upiId, invoiceTemplate, language,
        inventorySettings: invSettings
      };

      const updatedBusinesses = profile.businesses.map(b => 
        b.id === currentBusiness.id 
          ? updatedBusiness as any
          : b
      );

      await updateDoc(doc(db, 'users', user.uid), {
        businesses: updatedBusinesses
      });

      // Also update global businesses collection
      await updateDoc(doc(db, 'businesses', currentBusiness.id), {
        ...updatedBusiness,
        updatedAt: new Date().toISOString()
      }).catch(err => {
        // If it doesn't exist in global collection yet (old business), create it
        if (err.code === 'not-found') {
          setDoc(doc(db, 'businesses', currentBusiness.id), {
            ...updatedBusiness,
            ownerId: user.uid,
            createdAt: new Date().toISOString()
          });
        }
      });

      toast.success('Settings updated successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  const upiLink = currentBusiness?.upiId 
    ? `upi://pay?pa=${currentBusiness.upiId}&pn=${encodeURIComponent(currentBusiness.name)}&cu=INR`
    : '';

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your business profile, tax details, and UPI payments.</p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="panel-card">
            <div className="text-base font-bold mb-6 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Business Profile & GST
            </div>
            <form onSubmit={handleUpdateBusiness} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-[13px] font-semibold">Business Name *</Label>
                  <Input 
                    id="name" 
                    name="name" 
                    defaultValue={currentBusiness?.name} 
                    required 
                    className="border-border-main"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gstNumber" className="text-[13px] font-semibold">GST Number</Label>
                  <Input 
                    id="gstNumber" 
                    name="gstNumber" 
                    defaultValue={currentBusiness?.gstNumber} 
                    placeholder="27AAAAA0000A1Z5"
                    className="border-border-main"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-[13px] font-semibold">Business Phone</Label>
                  <Input 
                    id="phone" 
                    name="phone" 
                    defaultValue={currentBusiness?.phone} 
                    placeholder="9876543210"
                    className="border-border-main"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency" className="text-[13px] font-semibold">Currency Symbol</Label>
                  <Select name="currency" defaultValue={currentBusiness?.currency || '₹'}>
                    <SelectTrigger className="border-border-main">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="₹">INR (₹)</SelectItem>
                      <SelectItem value="$">USD ($)</SelectItem>
                      <SelectItem value="€">EUR (€)</SelectItem>
                      <SelectItem value="£">GBP (£)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="upiId" className="text-[13px] font-semibold">UPI ID (for QR Code)</Label>
                <Input 
                  id="upiId" 
                  name="upiId" 
                  defaultValue={currentBusiness?.upiId} 
                  placeholder="yourname@upi"
                  className="border-border-main"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address" className="text-[13px] font-semibold">Business Address</Label>
                <Input 
                  id="address" 
                  name="address" 
                  defaultValue={currentBusiness?.address} 
                  placeholder="Full business address for invoices"
                  className="border-border-main"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invoiceTemplate" className="text-[13px] font-semibold">Invoice Template</Label>
                  <Select name="invoiceTemplate" defaultValue={currentBusiness?.invoiceTemplate || 'classic'}>
                    <SelectTrigger className="border-border-main">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic">Classic (Standard)</SelectItem>
                      <SelectItem value="modern">Modern (Stylish)</SelectItem>
                      <SelectItem value="compact">Compact (Small)</SelectItem>
                      <SelectItem value="professional">Professional (Business)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language" className="text-[13px] font-semibold">Communication Language</Label>
                  <Select name="language" defaultValue={currentBusiness?.language || 'en'}>
                    <SelectTrigger className="border-border-main">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="mr">Marathi (मराठी)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-4">
                <Button type="submit" className="w-full md:w-auto px-8 bg-primary hover:bg-primary/90" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel-card">
            <div className="text-base font-bold mb-6 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              UPI QR Code
            </div>
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-lg border border-border-main">
              {upiLink ? (
                <>
                  <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
                    <QRCodeSVG value={upiLink} size={150} />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-bold text-text-muted uppercase mb-1">Your UPI ID</div>
                    <div className="text-sm font-mono font-bold text-primary">{currentBusiness?.upiId}</div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <QrCode className="w-12 h-12 mx-auto mb-2 text-slate-200" />
                  <p className="text-xs text-text-muted">Enter UPI ID to generate QR code</p>
                </div>
              )}
            </div>
          </div>

          <div className="panel-card">
            <div className="text-base font-bold mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Account Info
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg border border-border-main">
                <div className="text-[11px] text-text-muted uppercase font-bold mb-1">Email Address</div>
                <div className="text-sm font-medium">{user?.email}</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg border border-border-main">
                <div className="text-[11px] text-text-muted uppercase font-bold mb-1">Business ID</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-mono text-text-muted break-all">{currentBusiness?.id}</div>
                  <Button 
                    variant="ghost" 
                    size="icon-sm" 
                    onClick={() => {
                      if (currentBusiness?.id) {
                        navigator.clipboard.writeText(currentBusiness.id);
                        toast.success('Business ID copied to clipboard');
                      }
                    }}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-3">
          <div className="panel-card">
            <div className="text-base font-bold mb-6 flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-primary" />
              Inventory & Input Customization
            </div>

            <div className="space-y-8">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-border-main">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-bold">Enable Alphanumeric Codes</Label>
                      <p className="text-[11px] text-text-muted">Allow alphabets in purchase quantity & value fields.</p>
                    </div>
                    <Switch 
                      checked={invSettings.enableAlphanumericCodes}
                      onCheckedChange={(val) => setInvSettings(prev => ({ ...prev, enableAlphanumericCodes: val }))}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-border-main">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-bold">Smart Alphabet-to-Number Conversion</Label>
                      <p className="text-[11px] text-text-muted">Automatically convert mappings during calculations.</p>
                    </div>
                    <Switch 
                      checked={invSettings.enableAlphaToNumberMapping}
                      onCheckedChange={(val) => setInvSettings(prev => ({ ...prev, enableAlphaToNumberMapping: val }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold">Conversion Logic</Label>
                    <Select 
                      value={invSettings.conversionLogic} 
                      onValueChange={(val: any) => setInvSettings(prev => ({ ...prev, conversionLogic: val }))}
                    >
                      <SelectTrigger className="border-border-main">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="prefix">Prefix (A=10, A5 → 105)</SelectItem>
                        <SelectItem value="sum">Sum/Segment (Advanced Pattern Matching)</SelectItem>
                        <SelectItem value="replace">Direct Replace (Full Code Match Only)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="panel-card bg-primary/5 border-primary/10">
                  <div className="text-sm font-bold mb-4 flex items-center gap-2 text-primary">
                    <ArrowRightLeft className="w-4 h-4" />
                    Preview / Test Converter
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[11px] uppercase font-bold text-text-muted">Test Input</Label>
                      <Input 
                        placeholder="e.g. A5 or BOX-10" 
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                        className="bg-white"
                      />
                    </div>
                    <div className="p-4 bg-white rounded-lg border border-primary/20 flex items-center justify-between">
                      <span className="text-xs font-semibold text-text-muted">Numeric Equivalent:</span>
                      <span className="text-xl font-bold text-primary">
                        {testInput ? convertToNumeric(testInput, invSettings) : '0'}
                      </span>
                    </div>
                    <p className="text-[10px] text-text-muted italic">
                      * Values are converted real-time based on your mapping table below.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-bold">Alphabet-Number Mapping Table</Label>
                  <div className="flex gap-2">
                    <input 
                      type="file" 
                      id="import-mappings" 
                      className="hidden" 
                      accept=".json" 
                      onChange={handleImportMappings} 
                    />
                    <Button variant="outline" size="sm" onClick={() => document.getElementById('import-mappings')?.click()} className="gap-2">
                      <Upload className="w-3 h-3" /> Import
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportMappings} className="gap-2">
                      <Download className="w-3 h-3" /> Export
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      if(confirm('Are you sure you want to clear all mappings?')) {
                        setInvSettings(prev => ({ ...prev, mappings: {} }));
                      }
                    }}>Reset</Button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-4 items-end bg-slate-50 p-4 rounded-lg border border-border-main">
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-[11px] uppercase font-bold text-text-muted">Alphabet Code</Label>
                    <Input 
                      placeholder="e.g. A or BOX" 
                      value={newMappingCode}
                      onChange={(e) => setNewMappingCode(e.target.value.toUpperCase())}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] uppercase font-bold text-text-muted">Value</Label>
                    <Input 
                      type="number"
                      placeholder="Numeric value" 
                      value={newMappingValue}
                      onChange={(e) => setNewMappingValue(e.target.value)}
                      className="bg-white"
                    />
                  </div>
                  <Button className="w-full gap-2" onClick={addMapping}>
                    <Plus className="w-4 h-4" /> Add Mapping
                  </Button>
                </div>

                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead>Alphabet Code</TableHead>
                        <TableHead>Numeric Value</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.keys(invSettings.mappings).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-text-muted text-xs">
                            No custom mappings defined. Add codes like A=10, B=20 above.
                          </TableCell>
                        </TableRow>
                      ) : (
                        Object.entries(invSettings.mappings).map(([code, value]) => (
                          <TableRow key={code}>
                            <TableCell className="font-bold">{code}</TableCell>
                            <TableCell>{value}</TableCell>
                            <TableCell className="text-right">
                              <Button 
                                variant="ghost" 
                                size="icon-sm" 
                                className="text-danger hover:bg-danger/10"
                                onClick={() => removeMapping(code)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Validation Rules Manager */}
              <div className="space-y-4 border-t pt-8">
                <div className="text-sm font-bold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  Validation Rules Manager
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-border-main">
                    <div className="space-y-0.5">
                      <Label className="text-[12px] font-bold">Strict Mode</Label>
                      <p className="text-[10px] text-text-muted">Only allow valid mappings.</p>
                    </div>
                    <Switch 
                      checked={invSettings.strictMode}
                      onCheckedChange={(val) => setInvSettings(prev => ({ ...prev, strictMode: val }))}
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-border-main">
                    <div className="space-y-0.5">
                      <Label className="text-[12px] font-bold">Force Positive</Label>
                      <p className="text-[10px] text-text-muted">No negative results.</p>
                    </div>
                    <Switch 
                      checked={invSettings.enforcePositive}
                      onCheckedChange={(val) => setInvSettings(prev => ({ ...prev, enforcePositive: val }))}
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-border-main">
                    <div className="space-y-0.5">
                      <Label className="text-[12px] font-bold">Allow Decimals</Label>
                      <p className="text-[10px] text-text-muted">Support decimal values.</p>
                    </div>
                    <Switch 
                      checked={invSettings.allowDecimals}
                      onCheckedChange={(val) => setInvSettings(prev => ({ ...prev, allowDecimals: val }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
