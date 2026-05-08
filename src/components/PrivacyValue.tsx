/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatPrivacyValue, isFieldHidden } from '../lib/privacyService';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface PrivacyValueProps {
  value: number | string;
  fieldId: string;
  className?: string;
  prefix?: string;
  suffix?: string;
}

export const PrivacyValue: React.FC<PrivacyValueProps> = ({ 
  value, 
  fieldId, 
  className,
  prefix = '',
  suffix = ''
}) => {
  const { currentBusiness } = useAuth();
  const settings = currentBusiness?.privacySettings;
  const isHiddenBySettings = isFieldHidden(fieldId, settings);
  
  const [revealed, setRevealed] = useState(false);
  const [showPinInput, setShowPinInput] = useState(false);
  const [pin, setPin] = useState('');

  if (!isHiddenBySettings) {
    return <span className={className}>{prefix}{value}{suffix}</span>;
  }

  const handleRevealClick = () => {
    if (revealed) {
      setRevealed(false);
      return;
    }

    if (settings?.requirePinToReveal && settings.privacyPin) {
      setShowPinInput(prev => !prev);
    } else {
      setRevealed(true);
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === settings?.privacyPin) {
      setRevealed(true);
      setShowPinInput(false);
      setPin('');
      toast.success('Access granted');
    } else {
      toast.error('Invalid PIN');
      setPin('');
    }
  };

  const displayValue = revealed 
    ? value 
    : formatPrivacyValue(value, settings);

  const isBlurMode = !revealed && settings?.visibilityMode === 'blur';

  return (
    <div className="inline-flex items-center gap-1 group relative">
      <span className={cn(
        className,
        isBlurMode && "blur-sm select-none"
      )}>
        {prefix}{displayValue}{suffix}
      </span>
      
      {!revealed && showPinInput ? (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white p-2 rounded shadow-xl border border-border-main flex gap-1">
          <form onSubmit={handlePinSubmit} className="flex gap-1">
            <input
              type="password"
              placeholder="PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-16 h-7 text-xs border rounded px-2 focus:ring-1 focus:ring-primary outline-none"
              autoFocus
            />
            <Button type="submit" size="sm" variant="default" className="h-7 w-7 p-0">
              <Lock className="w-3 h-3" />
            </Button>
          </form>
        </div>
      ) : null}

      <button
        onClick={handleRevealClick}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-100 text-text-muted"
        title={revealed ? "Hide" : "Reveal"}
      >
        {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      </button>
    </div>
  );
};
