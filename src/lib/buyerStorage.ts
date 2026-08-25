export interface BuyerInfo {
  firstName: string;
  lastName: string;
  email: string;
  dialCode: string;
  phoneNumber: string;
  identityType: 'KTP' | 'PASSPORT' | 'SIM';
  identityNumber: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  gender: 'MALE' | 'FEMALE';
  whatsappConsent: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

export const defaultBuyerInfo: BuyerInfo = {
  firstName: '',
  lastName: '',
  email: '',
  dialCode: '+62',
  phoneNumber: '',
  identityType: 'KTP',
  identityNumber: '',
  birthDay: '1',
  birthMonth: '1',
  birthYear: '2000',
  gender: 'MALE',
  whatsappConsent: true,
  termsAccepted: false,
  privacyAccepted: false,
};

export function getStoredBuyerInfo(): BuyerInfo {
  if (typeof window === 'undefined') return defaultBuyerInfo;
  try {
    const saved = window.sessionStorage.getItem('tsv_buyer_info');
    if (saved) {
      return { ...defaultBuyerInfo, ...JSON.parse(saved) };
    }
  } catch {
    // Ignore error
  }
  return defaultBuyerInfo;
}
