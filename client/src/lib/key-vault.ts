const DB_NAME = 'reconquest-key-vault';
const DB_VERSION = 1;
const STORE_NAME = 'escrow-keys';

interface StoredKey {
  loanId: number;
  role: 'borrower' | 'lender';
  encryptedPrivateKey: ArrayBuffer;
  publicKey: string;
  iv: Uint8Array;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: ['loanId', 'role'] });
        store.createIndex('loanId', 'loanId', { unique: false });
      }
    };
  });
  
  return dbPromise;
}

async function getDeviceKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem('reconquest-device-key');
  
  if (stored) {
    const keyData = JSON.parse(stored);
    return await crypto.subtle.importKey(
      'jwk',
      keyData,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  const exportedKey = await crypto.subtle.exportKey('jwk', key);
  localStorage.setItem('reconquest-device-key', JSON.stringify(exportedKey));
  
  return key;
}

export async function storeKey(
  loanId: number,
  role: 'borrower' | 'lender',
  privateKey: Uint8Array,
  publicKey: string
): Promise<void> {
  const deviceKey = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedPrivateKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    deviceKey,
    privateKey
  );
  
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const data: StoredKey = {
      loanId,
      role,
      encryptedPrivateKey,
      publicKey,
      iv,
      createdAt: Date.now(),
    };
    
    const request = store.put(data);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function retrieveKey(
  loanId: number,
  role: 'borrower' | 'lender'
): Promise<{ privateKey: Uint8Array; publicKey: string } | null> {
  const db = await getDB();
  
  const stored = await new Promise<StoredKey | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get([loanId, role]);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  
  if (!stored) return null;
  
  const deviceKey = await getDeviceKey();
  
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: stored.iv },
      deviceKey,
      stored.encryptedPrivateKey
    );
    
    return {
      privateKey: new Uint8Array(decrypted),
      publicKey: stored.publicKey,
    };
  } catch (e) {
    console.error('Failed to decrypt key:', e);
    return null;
  }
}

export async function deleteKey(
  loanId: number,
  role: 'borrower' | 'lender'
): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete([loanId, role]);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function hasStoredKey(
  loanId: number,
  role: 'borrower' | 'lender'
): Promise<boolean> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.count([loanId, role]);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result > 0);
  });
}

export function createRecoveryBundle(
  loanId: number,
  role: 'borrower' | 'lender',
  privateKey: Uint8Array,
  publicKey: string,
  escrowAddress: string
): string {
  const bundle = {
    version: 1,
    loanId,
    role,
    publicKey,
    escrowAddress,
    privateKeyHex: Array.from(privateKey).map(b => b.toString(16).padStart(2, '0')).join(''),
    createdAt: new Date().toISOString(),
    warning: 'KEEP THIS FILE SECURE. It contains your private key for signing escrow transactions.',
  };
  
  return JSON.stringify(bundle, null, 2);
}

export function parseRecoveryBundle(bundleJson: string): {
  loanId: number;
  role: 'borrower' | 'lender';
  privateKey: Uint8Array;
  publicKey: string;
} | null {
  try {
    const bundle = JSON.parse(bundleJson);
    const privateKey = new Uint8Array(
      bundle.privateKeyHex.match(/.{1,2}/g).map((byte: string) => parseInt(byte, 16))
    );
    return {
      loanId: bundle.loanId,
      role: bundle.role,
      privateKey,
      publicKey: bundle.publicKey,
    };
  } catch (e) {
    console.error('Failed to parse recovery bundle:', e);
    return null;
  }
}
