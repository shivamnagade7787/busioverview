/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventorySettings } from "../types";

/**
 * Converts alphanumeric strings to numbers based on custom mappings.
 * Example: if A=10, then "A5" could be 105 (prefix) or 15 (sum).
 */
export const convertToNumeric = (
  input: string | number,
  settings?: InventorySettings
): number => {
  if (typeof input === 'number') return input;
  if (!input) return 0;
  
  const value = input.trim();
  if (!isNaN(Number(value))) return Number(value);

  if (!settings || !settings.enableAlphaToNumberMapping) {
    // If not enabled, try to extract only numeric part or return 0
    const numericPart = value.replace(/[^0-9.]/g, '');
    return Number(numericPart) || 0;
  }

  const { mappings, conversionLogic, enforcePositive, strictMode, allowDecimals } = settings;
  const upperValue = value.toUpperCase();
  let result = 0;
  
  // Sort keys by length descending
  const sortedKeys = Object.keys(mappings).sort((a, b) => b.length - a.length);

  let decodedValue = "";

  // Simple replacement logic
  if (mappings[upperValue] !== undefined) {
    result = mappings[upperValue];
  } else {
    // Iterative replacement for parts
    let i = 0;
    while (i < upperValue.length) {
      let matchFound = false;
      for (const key of sortedKeys) {
        if (upperValue.startsWith(key, i)) {
          const mappedVal = mappings[key];
          decodedValue += mappedVal.toString();
          i += key.length;
          matchFound = true;
          break;
        }
      }
      
      if (!matchFound) {
        if (/[0-9]/.test(upperValue[i])) {
          decodedValue += upperValue[i];
        } else if (upperValue[i] === '.' && allowDecimals !== false) {
          decodedValue += upperValue[i];
        }
        i++;
      }
    }
    result = Number(decodedValue) || 0;
  }

  if (enforcePositive && result < 0) return 0;

  return result;
};

/**
 * Validates if the input matches any forbidden characters or duplicate patterns
 */
export const validateMappingCode = (code: string, mappings: Record<string, number>): { valid: boolean; error?: string } => {
  if (!code) return { valid: false, error: "Code cannot be empty" };
  if (/[0-9]/.test(code)) return { valid: false, error: "Code cannot contain numbers" };
  if (mappings[code] !== undefined) return { valid: false, error: "Duplicate mapping" };
  return { valid: true };
};
