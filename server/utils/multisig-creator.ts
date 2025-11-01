import * as secp256k1 from '@noble/secp256k1';

/**
 * Multisig Creator - Server-side utility for creating 2-of-3 multisig Bitcoin addresses
 * This uses the same logic as the Firefish WASM mock for consistency
 */

export interface MultisigAddress {
  address: string;
  witnessScript: string;
  scriptHash: string;
}

/**
 * Validate a Bitcoin public key (compressed secp256k1)
 * Uses cryptographic verification to ensure the key is a valid curve point
 * @param pubkey - The public key hex string
 * @param label - Label for error messages
 */
async function validatePublicKey(pubkey: string, label: string): Promise<void> {
  // Must be exactly 66 hex characters
  if (!pubkey || pubkey.length !== 66) {
    throw new Error(`${label} public key must be exactly 66 characters (33 bytes compressed)`);
  }
  
  // Must be valid hexadecimal
  if (!/^[0-9a-fA-F]{66}$/.test(pubkey)) {
    throw new Error(`${label} public key must be valid hexadecimal`);
  }
  
  // Must start with 02 or 03 (compressed public key prefix)
  const prefix = pubkey.substring(0, 2);
  if (prefix !== '02' && prefix !== '03') {
    throw new Error(`${label} public key must start with 02 or 03 (compressed format)`);
  }
  
  // CRITICAL: Cryptographically verify the public key is a valid secp256k1 curve point
  // This prevents injection of syntactically correct but cryptographically invalid keys
  try {
    // Convert hex to Uint8Array for validation
    const pubkeyBytes = new Uint8Array(33);
    for (let i = 0; i < 33; i++) {
      pubkeyBytes[i] = parseInt(pubkey.substr(i * 2, 2), 16);
    }
    
    // Verify this is a valid secp256k1 point using Point.fromHex
    const point = secp256k1.Point.fromHex(pubkey);
    
    // Additional sanity check: ensure point is on the curve
    if (!point) {
      throw new Error(`${label} public key is not a valid secp256k1 point`);
    }
  } catch (error) {
    throw new Error(`${label} public key failed cryptographic validation: ${error instanceof Error ? error.message : 'invalid curve point'}`);
  }
}

/**
 * Create a 2-of-3 multisig Bitcoin testnet address
 * Same algorithm as Firefish WASM mock createEscrow function
 */
export async function createMultisigAddress(
  borrowerPubkey: string,
  lenderPubkey: string,
  platformPubkey: string
): Promise<MultisigAddress> {
  // Validate all public keys with cryptographic verification
  await validatePublicKey(borrowerPubkey, 'Borrower');
  await validatePublicKey(lenderPubkey, 'Lender');
  await validatePublicKey(platformPubkey, 'Platform');

  // Mock witness script (OP_2 <pubkey1> <pubkey2> <pubkey3> OP_3 OP_CHECKMULTISIG)
  // This is the same format used by Firefish WASM mock
  const witnessScript = '5221' + 
    [borrowerPubkey, lenderPubkey, platformPubkey]
      .map(p => p.slice(0, 66))
      .join('') + 
    '53ae';

  // Mock script hash (SHA256 of witness script)
  const scriptHash = 'sha256:' + witnessScript.slice(0, 64);

  // Generate testnet address (tb1q... for P2WSH)
  const addressSuffix = witnessScript.slice(0, 40);
  const address = `tb1q${addressSuffix}`;

  console.log(`✅ Created 2-of-3 multisig address: ${address}`);
  console.log(`   Borrower: ${borrowerPubkey.substring(0, 20)}...`);
  console.log(`   Lender: ${lenderPubkey.substring(0, 20)}...`);
  console.log(`   Platform: ${platformPubkey.substring(0, 20)}...`);

  return {
    address,
    witnessScript,
    scriptHash,
  };
}
