export interface StoredBitcoinKeys {
  loanId: number;
  privateKey: string;
  publicKey: string;
  wif: string;
  timestamp: number;
}

const STORAGE_KEY_PREFIX = 'reconquest_btc_keys_';

export function storeBitcoinKeys(loanId: number, keys: {
  privateKey: string;
  publicKey: string;
  wif: string;
}): void {
  const storedData: StoredBitcoinKeys = {
    loanId,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    wif: keys.wif,
    timestamp: Date.now(),
  };

  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${loanId}`,
      JSON.stringify(storedData)
    );
  } catch (error) {
    console.error('Failed to store Bitcoin keys:', error);
    throw new Error('Failed to securely store your Bitcoin keys. Please save them manually.');
  }
}

export function getBitcoinKeys(loanId: number): StoredBitcoinKeys | null {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${loanId}`);
    if (!stored) return null;
    
    return JSON.parse(stored) as StoredBitcoinKeys;
  } catch (error) {
    console.error('Failed to retrieve Bitcoin keys:', error);
    return null;
  }
}

export function removeBitcoinKeys(loanId: number): void {
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${loanId}`);
  } catch (error) {
    console.error('Failed to remove Bitcoin keys:', error);
  }
}

export function getAllStoredLoanIds(): number[] {
  const loanIds: number[] = [];
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_KEY_PREFIX)) {
        const loanId = parseInt(key.replace(STORAGE_KEY_PREFIX, ''), 10);
        if (!isNaN(loanId)) {
          loanIds.push(loanId);
        }
      }
    }
  } catch (error) {
    console.error('Failed to retrieve stored loan IDs:', error);
  }
  
  return loanIds;
}
