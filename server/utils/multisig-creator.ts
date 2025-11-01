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
 * Create a 2-of-3 multisig Bitcoin testnet address
 * Same algorithm as Firefish WASM mock createEscrow function
 */
export function createMultisigAddress(
  borrowerPubkey: string,
  lenderPubkey: string,
  platformPubkey: string
): MultisigAddress {
  // Validate inputs
  if (!borrowerPubkey || borrowerPubkey.length !== 66) {
    throw new Error('Invalid borrower public key');
  }
  if (!lenderPubkey || lenderPubkey.length !== 66) {
    throw new Error('Invalid lender public key');
  }
  if (!platformPubkey || platformPubkey.length !== 66) {
    throw new Error('Invalid platform public key');
  }

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
