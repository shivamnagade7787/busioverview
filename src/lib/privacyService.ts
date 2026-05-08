/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PrivacySettings } from "../types";

/**
 * Masks a numeric value based on privacy settings.
 */
export const formatPrivacyValue = (
  value: number | string,
  settings?: PrivacySettings,
  forceShow: boolean = false
): string => {
  if (forceShow || !settings || !settings.hideNumericValues) {
    return value.toString();
  }

  const strValue = value.toString();
  const mode = settings.visibilityMode;

  switch (mode) {
    case 'mask':
      // ₹25,000 -> ******
      return '*'.repeat(Math.max(strValue.length, 4));

    case 'partial':
      // ₹25,000 -> ₹2****
      if (strValue.length <= 2) return strValue[0] + '*';
      return strValue.substring(0, 2) + '*'.repeat(strValue.length - 2);

    case 'replace':
      // "Confidential"
      return settings.customReplaceText || 'Hidden';

    case 'blur':
      // Blurred text using CSS - we'll handle the actual blur in the component,
      // but here we return a placeholder that the component recognizes.
      return strValue;

    default:
      return strValue;
  }
};

/**
 * Checks if a specific field type should be hidden based on settings.
 */
export const isFieldHidden = (fieldId: string, settings?: PrivacySettings): boolean => {
  if (!settings || !settings.hideNumericValues) return false;
  return settings.hiddenFields.includes(fieldId);
};
