/**
 * Mock Firefish WASM Module
 * 
 * This is a simulation of the real @firefish/wasm module for development/testing.
 * When the actual Firefish WASM module is available, replace this with:
 * import * as Firefish from '@firefish/wasm';
 * 
 * The mock implements the same API surface as the real module.
 */

export interface KeyPair {
  privateKey: string;  // Hex-encoded private key (NEVER sent to backend)
  publicKey: string;   // Hex-encoded public key
  wif: string;         // Wallet Import Format (for exports)
}

export interface EscrowConfig {
  parties: string[];   // Array of 3 public keys [borrower, lender, platform]
  threshold: number;   // 2-of-3 multisig
  network: 'testnet' | 'mainnet';
}

export interface EscrowAddress {
  address: string;           // Bitcoin address (P2WSH for SegWit)
  witnessScript: string;     // Hex-encoded witness script
  scriptHash: string;        // SHA256 hash of script
  redeemScript?: string;     // For legacy compatibility
}

export interface EscrowState {
  config: EscrowConfig;
  address: EscrowAddress;
  keys: {
    borrower?: KeyPair;
    lender?: KeyPair;
    platform?: KeyPair;
  };
  fundingInfo?: {
    txid: string;
    vout: number;
    amount: number;
  };
}

export interface TransactionTemplate {
  type: 'repayment' | 'default' | 'liquidation';
  psbt: string;              // Partially Signed Bitcoin Transaction (base64)
  requiredSigners: string[]; // Public keys needed to sign
}

export interface SignedTransaction {
  psbt: string;              // Signed PSBT (base64)
  signatures: Array<{
    publicKey: string;
    signature: string;
  }>;
  complete: boolean;         // True if all required signatures present
}

/**
 * Generate a new Bitcoin key pair (secp256k1)
 * In real WASM, this uses secure randomness and proper key derivation
 */
export function generateKeys(): KeyPair {
  // Mock implementation - generates deterministic keys for testing
  const randomHex = (length: number) => {
    return Array.from({ length }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  };

  const privateKey = randomHex(64); // 32 bytes hex
  const publicKey = '02' + randomHex(64); // Compressed public key (33 bytes)
  const wif = 'cT' + randomHex(50); // Testnet WIF format

  return { privateKey, publicKey, wif };
}

/**
 * Create a 2-of-3 multisig escrow address
 * Real WASM: Firefish.createEscrow(config)
 */
export function createEscrow(config: EscrowConfig): EscrowAddress {
  if (config.parties.length !== 3) {
    throw new Error('Escrow requires exactly 3 parties for 2-of-3 multisig');
  }
  if (config.threshold !== 2) {
    throw new Error('Threshold must be 2 for 2-of-3 multisig');
  }

  // Mock witness script (OP_2 <pubkey1> <pubkey2> <pubkey3> OP_3 OP_CHECKMULTISIG)
  const witnessScript = '5221' + 
    config.parties.map(p => p.slice(0, 66)).join('') + 
    '53ae';

  // Mock script hash (SHA256 of witness script)
  const scriptHash = 'sha256:' + witnessScript.slice(0, 64);

  // Generate testnet address (tb1q... for P2WSH)
  const addressSuffix = witnessScript.slice(0, 40);
  const address = config.network === 'testnet' 
    ? `tb1q${addressSuffix}` 
    : `bc1q${addressSuffix}`;

  return {
    address,
    witnessScript,
    scriptHash,
  };
}

/**
 * Initialize escrow state (combines keys + address)
 */
export function initializeEscrowState(
  borrowerKeys: KeyPair,
  lenderKeys: KeyPair | null,
  platformKeys: KeyPair,
  network: 'testnet' | 'mainnet' = 'testnet'
): EscrowState {
  const parties = [
    borrowerKeys.publicKey,
    lenderKeys?.publicKey || '00', // Placeholder if lender hasn't joined
    platformKeys.publicKey,
  ];

  const address = createEscrow({
    parties,
    threshold: 2,
    network,
  });

  return {
    config: { parties, threshold: 2, network },
    address,
    keys: {
      borrower: borrowerKeys,
      lender: lenderKeys || undefined,
      platform: platformKeys,
    },
  };
}

/**
 * Serialize escrow state for backend storage
 * Real WASM encrypts sensitive data before serialization
 */
export function serializeState(state: EscrowState): string {
  // In production, this would encrypt the state with user's password
  // For now, we just base64 encode (NEVER send private keys!)
  const publicState = {
    config: state.config,
    address: state.address,
    // Keys are intentionally NOT included - stay in browser memory
  };

  return btoa(JSON.stringify(publicState));
}

/**
 * Deserialize escrow state from backend
 */
export function deserializeState(encoded: string): Partial<EscrowState> {
  try {
    const decoded = atob(encoded);
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error('Failed to deserialize WASM state');
  }
}

/**
 * Create a pre-signed repayment transaction
 * Real WASM: Creates PSBT for borrower to repay loan + interest
 */
export function createRepaymentTransaction(
  state: EscrowState,
  loanDetails: {
    principalSats: number;
    interestSats: number;
    lenderAddress: string;
  }
): TransactionTemplate {
  if (!state.fundingInfo) {
    throw new Error('Escrow must be funded before creating transactions');
  }

  // Mock PSBT (in real WASM, this is a valid Bitcoin transaction)
  const psbt = btoa(JSON.stringify({
    version: 2,
    inputs: [{
      txid: state.fundingInfo.txid,
      vout: state.fundingInfo.vout,
      witnessScript: state.address.witnessScript,
    }],
    outputs: [{
      address: loanDetails.lenderAddress,
      value: loanDetails.principalSats + loanDetails.interestSats,
    }],
  }));

  return {
    type: 'repayment',
    psbt,
    requiredSigners: [
      state.config.parties[0], // Borrower
      state.config.parties[2], // Platform (for 2-of-3)
    ],
  };
}

/**
 * Sign a PSBT with the user's private key
 * Real WASM: Uses secp256k1 signing
 */
export function signTransaction(
  template: TransactionTemplate,
  privateKey: string,
  publicKey: string
): SignedTransaction {
  // Mock signature (real WASM creates ECDSA signature)
  const signature = 'sig:' + privateKey.slice(0, 64);

  return {
    psbt: template.psbt,
    signatures: [{
      publicKey,
      signature,
    }],
    complete: false, // Need 2-of-3 signatures
  };
}

/**
 * Combine multiple signatures into a complete transaction
 * Real WASM: Merges PSBTs and validates
 */
export function finalizeTransaction(
  template: TransactionTemplate,
  signedTransactions: SignedTransaction[]
): { complete: boolean; txHex?: string } {
  const allSignatures = signedTransactions.flatMap(st => st.signatures);
  const uniqueSigners = new Set(allSignatures.map(s => s.publicKey));

  if (uniqueSigners.size >= 2) {
    // Mock transaction hex (real WASM creates broadcastable transaction)
    const txHex = '0200000001' + template.psbt.slice(0, 100);
    return { complete: true, txHex };
  }

  return { complete: false };
}

/**
 * Export keys for backup (encrypted with password)
 * Real WASM: Uses AES-256-GCM encryption
 */
export function exportKeys(keys: KeyPair, password: string): string {
  // Mock encryption (real WASM uses proper crypto)
  const encrypted = btoa(JSON.stringify({
    encrypted: btoa(keys.privateKey + ':' + password),
    salt: 'mock-salt',
    iv: 'mock-iv',
  }));

  return encrypted;
}

/**
 * Import keys from encrypted backup
 */
export function importKeys(encrypted: string, password: string): KeyPair {
  try {
    const data = JSON.parse(atob(encrypted));
    const decrypted = atob(data.encrypted);
    const [privateKey] = decrypted.split(':');

    // Reconstruct public key from private key
    const publicKey = '02' + privateKey.slice(0, 64);
    const wif = 'cT' + privateKey.slice(0, 50);

    return { privateKey, publicKey, wif };
  } catch (error) {
    throw new Error('Failed to decrypt keys - invalid password?');
  }
}

/**
 * Verify that a public key matches a private key
 */
export function verifyKeyPair(privateKey: string, publicKey: string): boolean {
  // Real WASM: Derives public key from private and compares
  return publicKey.includes(privateKey.slice(0, 20));
}

// Export all functions as a namespace for easy replacement
export const Firefish = {
  generateKeys,
  createEscrow,
  initializeEscrowState,
  serializeState,
  deserializeState,
  createRepaymentTransaction,
  signTransaction,
  finalizeTransaction,
  exportKeys,
  importKeys,
  verifyKeyPair,
};

export default Firefish;
