const DB_NAME = 'reconquest-key-vault';
const DB_VERSION = 1;
const STORE_NAME = 'escrow-keys';
const RECOVERY_VERSION = 2;

interface StoredKey {
  loanId: number;
  role: 'borrower' | 'lender';
  encryptedPrivateKey: ArrayBuffer;
  publicKey: string;
  iv: Uint8Array;
  createdAt: number;
}

interface RecoveryBundle {
  version: number;
  loanId: number;
  role: 'borrower' | 'lender';
  publicKey: string;
  escrowAddress: string;
  encryptedKeyHex: string;
  ivHex: string;
  saltHex: string;
  createdAt: string;
  warning: string;
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

async function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function createRecoveryBundle(
  loanId: number,
  role: 'borrower' | 'lender',
  privateKey: Uint8Array,
  publicKey: string,
  escrowAddress: string,
  passphrase: string
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encryptionKey = await deriveKeyFromPassphrase(passphrase, salt);
  
  const encryptedKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    privateKey
  );
  
  const bundle: RecoveryBundle = {
    version: RECOVERY_VERSION,
    loanId,
    role,
    publicKey,
    escrowAddress,
    encryptedKeyHex: bytesToHex(new Uint8Array(encryptedKey)),
    ivHex: bytesToHex(iv),
    saltHex: bytesToHex(salt),
    createdAt: new Date().toISOString(),
    warning: 'This file contains your encrypted private key. You need your passphrase to decrypt it.',
  };
  
  return JSON.stringify(bundle, null, 2);
}

export async function parseRecoveryBundle(
  bundleJson: string,
  passphrase: string
): Promise<{
  loanId: number;
  role: 'borrower' | 'lender';
  privateKey: Uint8Array;
  publicKey: string;
} | null> {
  try {
    const bundle = JSON.parse(bundleJson) as RecoveryBundle;
    
    if (bundle.version !== RECOVERY_VERSION) {
      console.error('Unsupported recovery bundle version:', bundle.version);
      return null;
    }
    
    if (typeof bundle.loanId !== 'number' || bundle.loanId <= 0) {
      console.error('Invalid loanId in recovery bundle');
      return null;
    }
    
    if (bundle.role !== 'borrower' && bundle.role !== 'lender') {
      console.error('Invalid role in recovery bundle');
      return null;
    }
    
    if (typeof bundle.publicKey !== 'string' || bundle.publicKey.length !== 66) {
      console.error('Invalid publicKey in recovery bundle');
      return null;
    }
    
    if (!bundle.encryptedKeyHex || !bundle.ivHex || !bundle.saltHex) {
      console.error('Missing encryption data in recovery bundle');
      return null;
    }
    
    const salt = hexToBytes(bundle.saltHex);
    const iv = hexToBytes(bundle.ivHex);
    const encryptedKey = hexToBytes(bundle.encryptedKeyHex);
    
    const decryptionKey = await deriveKeyFromPassphrase(passphrase, salt);
    
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        decryptionKey,
        encryptedKey
      );
      
      const privateKey = new Uint8Array(decrypted);
      
      if (privateKey.length !== 32) {
        console.error('Decrypted key has wrong length:', privateKey.length);
        return null;
      }
      
      return {
        loanId: bundle.loanId,
        role: bundle.role,
        privateKey,
        publicKey: bundle.publicKey,
      };
    } catch (e) {
      console.error('Failed to decrypt recovery bundle - wrong passphrase?', e);
      return null;
    }
  } catch (e) {
    console.error('Failed to parse recovery bundle:', e);
    return null;
  }
}

// ============================================================================
// SERVER-SIDE KEY VAULT (Firefish-style: no downloads, just passphrase)
// ============================================================================

interface ServerKeyVaultResponse {
  publicKey: string;
  encryptedPrivateKey: string;
  iv: string;
  salt: string;
  version: number;
}

export async function storeKeyOnServer(
  loanId: number,
  role: 'borrower' | 'lender',
  privateKey: Uint8Array,
  publicKey: string,
  passphrase: string
): Promise<boolean> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encryptionKey = await deriveKeyFromPassphrase(passphrase, salt);
    
    const encryptedKey = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      encryptionKey,
      privateKey
    );
    
    const response = await fetch('/api/key-vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        loanId,
        role,
        publicKey,
        encryptedPrivateKey: bytesToHex(new Uint8Array(encryptedKey)),
        iv: bytesToHex(iv),
        salt: bytesToHex(salt),
      }),
    });
    
    if (!response.ok) {
      console.error('Failed to store key on server:', await response.text());
      return false;
    }
    
    console.log(`[ServerVault] Key stored successfully for loan ${loanId}, role ${role}`);
    return true;
  } catch (e) {
    console.error('[ServerVault] Error storing key:', e);
    return false;
  }
}

export async function retrieveKeyFromServer(
  loanId: number,
  role: 'borrower' | 'lender',
  passphrase: string
): Promise<{ privateKey: Uint8Array; publicKey: string } | null> {
  try {
    const response = await fetch(`/api/key-vault/${loanId}/${role}`, {
      method: 'GET',
      credentials: 'include',
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[ServerVault] No key found for loan ${loanId}, role ${role}`);
        return null;
      }
      console.error('Failed to retrieve key from server:', await response.text());
      return null;
    }
    
    const data: ServerKeyVaultResponse = await response.json();
    
    const salt = hexToBytes(data.salt);
    const iv = hexToBytes(data.iv);
    const encryptedKey = hexToBytes(data.encryptedPrivateKey);
    
    const decryptionKey = await deriveKeyFromPassphrase(passphrase, salt);
    
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        decryptionKey,
        encryptedKey
      );
      
      const privateKey = new Uint8Array(decrypted);
      
      if (privateKey.length !== 32) {
        console.error('[ServerVault] Decrypted key has wrong length:', privateKey.length);
        return null;
      }
      
      console.log(`[ServerVault] Key retrieved and decrypted for loan ${loanId}, role ${role}`);
      return {
        privateKey,
        publicKey: data.publicKey,
      };
    } catch (e) {
      console.error('[ServerVault] Failed to decrypt - wrong passphrase?', e);
      return null;
    }
  } catch (e) {
    console.error('[ServerVault] Error retrieving key:', e);
    return null;
  }
}

export async function hasServerStoredKey(
  loanId: number,
  role: 'borrower' | 'lender'
): Promise<{ exists: boolean; publicKey?: string }> {
  try {
    const response = await fetch(`/api/key-vault/${loanId}/${role}/exists`, {
      method: 'GET',
      credentials: 'include',
    });
    
    if (!response.ok) {
      return { exists: false };
    }
    
    return await response.json();
  } catch (e) {
    console.error('[ServerVault] Error checking key existence:', e);
    return { exists: false };
  }
}
