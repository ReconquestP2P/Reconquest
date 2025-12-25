import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';

const execAsync = promisify(exec);

export interface MultisigEscrowResult {
  address: string;
  redeemScript: string;
  witnessScript: string;
  scriptHash: string;
  publicKeys: string[];
  platformPubkey: string; // Explicit platform public key
  signaturesRequired: number;
  totalKeys: number;
  network: string;
  addressType: string;
}

export interface IBitcoinEscrowService {
  generateMultisigEscrowAddress(
    borrowerPubkey: string, 
    lenderPubkey: string, 
    platformPubkey?: string
  ): Promise<MultisigEscrowResult>;
  verifyTransaction(address: string, expectedAmount: number): Promise<{ verified: boolean; txHash?: string }>;
  getTransactionUrl(txHash: string): string;
}

/**
 * Bitcoin Escrow Service for handling testnet Bitcoin multisig transactions
 * Creates 2-of-3 multisig addresses using borrower, lender, and platform public keys
 */
export class BitcoinEscrowService implements IBitcoinEscrowService {
  // Platform's public key for multisig escrow (TESTNET ONLY)
  // The private key is stored securely in PLATFORM_SIGNING_KEY environment variable
  public static readonly PLATFORM_PUBLIC_KEY = "03b1d168ccdfa27364697797909170da9177db95449f7a8ef5311be8b37717976e";
  
  // Get platform private key from environment (for signing)
  public static getPlatformPrivateKey(): string {
    const key = process.env.PLATFORM_SIGNING_KEY;
    if (!key) {
      throw new Error('PLATFORM_SIGNING_KEY environment variable not set');
    }
    return key;
  }
  
  private readonly platformPubkey = BitcoinEscrowService.PLATFORM_PUBLIC_KEY;

  /**
   * Generates a 2-of-3 multisig escrow address using the Python Bitcoin library
   * Requires public keys from borrower, lender, and platform
   * CRITICAL: All 3 public keys must be unique and valid
   */
  async generateMultisigEscrowAddress(
    borrowerPubkey: string, 
    lenderPubkey: string, 
    platformPubkey?: string
  ): Promise<MultisigEscrowResult> {
    try {
      // Use platform's default pubkey if not provided
      const actualPlatformPubkey = platformPubkey || this.platformPubkey;
      
      // Validate public key format (compressed, 66 hex chars)
      this.validatePublicKey(borrowerPubkey, 'borrower');
      this.validatePublicKey(lenderPubkey, 'lender');
      this.validatePublicKey(actualPlatformPubkey, 'platform');
      
      // CRITICAL: Validate all 3 keys are unique
      // This prevents the 2-of-3 multisig from becoming unspendable
      this.validateKeysAreUnique(borrowerPubkey, lenderPubkey, actualPlatformPubkey);
      
      console.log('Creating multisig escrow address for loan matching...');
      console.log(`Borrower: ${borrowerPubkey}`);
      console.log(`Lender: ${lenderPubkey}`);
      console.log(`Platform: ${actualPlatformPubkey}`);
      
      // Create temporary Python script file to avoid shell escaping issues
      const tempScriptPath = `/tmp/create_escrow_${Date.now()}.py`;
      const pythonScript = `import sys
import json
sys.path.append('.')
from bitcoin_escrow import create_multisig_escrow

borrower_key = "${borrowerPubkey}"
lender_key = "${lenderPubkey}"
platform_key = "${actualPlatformPubkey}"

try:
    result = create_multisig_escrow(borrower_key, lender_key, platform_key)
    print(json.dumps(result))
except Exception as e:
    print(f"ERROR: {str(e)}")
    sys.exit(1)
`;
      
      try {
        // Write Python script to temporary file
        writeFileSync(tempScriptPath, pythonScript);
        
        // Execute the Python script
        const { stdout, stderr } = await execAsync(`python3 ${tempScriptPath}`);
        
        // Clean up temporary file
        unlinkSync(tempScriptPath);
        
        if (stderr) {
          console.error('Python stderr:', stderr);
        }
        
        // Parse the JSON result
        const result = JSON.parse(stdout.trim());
        
        console.log(`Generated multisig address: ${result.address}`);
        console.log(`Redeem script: ${result.redeem_script}`);
        
        return {
          address: result.address,
          redeemScript: result.witness_script || result.redeem_script,
          witnessScript: result.witness_script, // Explicit witness script for P2WSH
          scriptHash: result.script_hash,
          publicKeys: result.public_keys,
          platformPubkey: result.public_keys_original_order.platform, // Correct platform key
          signaturesRequired: result.signatures_required,
          totalKeys: result.total_keys,
          network: result.network,
          addressType: result.address_type
        };
        
      } catch (execError: any) {
        // Clean up file if it exists
        try {
          unlinkSync(tempScriptPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        throw execError;
      }
      
    } catch (error: any) {
      console.error('Error generating multisig escrow address:', error);
      throw new Error(`Failed to generate multisig escrow address: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Validates that a public key is in the correct compressed format
   */
  private validatePublicKey(pubkey: string, type: string): void {
    if (!pubkey || typeof pubkey !== 'string') {
      throw new Error(`${type} public key must be a string`);
    }
    
    if (pubkey.length !== 66) {
      throw new Error(`${type} public key must be 66 characters (33 bytes compressed)`);
    }
    
    if (!pubkey.match(/^[0-9a-fA-F]{66}$/)) {
      throw new Error(`${type} public key must be valid hexadecimal`);
    }
    
    if (!pubkey.startsWith('02') && !pubkey.startsWith('03')) {
      throw new Error(`${type} public key must be compressed (start with 02 or 03)`);
    }
  }

  /**
   * CRITICAL: Validates that all 3 public keys are unique
   * A 2-of-3 multisig with duplicate keys cannot be properly spent
   * and funds would become permanently locked
   */
  private validateKeysAreUnique(borrowerPubkey: string, lenderPubkey: string, platformPubkey: string): void {
    const keys = [borrowerPubkey.toLowerCase(), lenderPubkey.toLowerCase(), platformPubkey.toLowerCase()];
    const uniqueKeys = new Set(keys);
    
    if (uniqueKeys.size !== 3) {
      // Identify which keys are duplicated
      if (borrowerPubkey.toLowerCase() === lenderPubkey.toLowerCase()) {
        throw new Error('CRITICAL: Borrower and lender public keys cannot be the same. Each party must generate unique keys.');
      }
      if (borrowerPubkey.toLowerCase() === platformPubkey.toLowerCase()) {
        throw new Error('CRITICAL: Borrower public key matches platform key. This would create an invalid multisig.');
      }
      if (lenderPubkey.toLowerCase() === platformPubkey.toLowerCase()) {
        throw new Error('CRITICAL: Lender public key matches platform key. This would create an invalid multisig.');
      }
      throw new Error('CRITICAL: All three public keys (borrower, lender, platform) must be unique for 2-of-3 multisig.');
    }
    
    console.log('✓ All 3 public keys validated as unique - safe to create multisig');
  }

  /**
   * Verifies that a Bitcoin transaction to the escrow address has occurred
   * In production: Would query Bitcoin testnet node or block explorer API
   * For POC: Simulates verification after a delay
   */
  async verifyTransaction(address: string, expectedAmount: number): Promise<{ verified: boolean; txHash?: string }> {
    console.log(`Verifying transaction to ${address} for ${expectedAmount} BTC`);
    
    // Simulate API call to testnet block explorer
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // For POC: Always return successful verification with mock tx hash
    const mockTxHash = this.generateMockTxHash();
    
    console.log(`Transaction verified! TxHash: ${mockTxHash}`);
    return {
      verified: true,
      txHash: mockTxHash
    };
  }

  /**
   * Returns the testnet block explorer URL for a transaction
   */
  getTransactionUrl(txHash: string): string {
    return `https://mempool.space/testnet4/tx/${txHash}`;
  }

  /**
   * Generates a valid testnet Bech32 address
   * Uses proper Bitcoin testnet address format that can be verified on block explorers
   */
  private generateValidTestnetAddress(): string {
    // Generate random 20-byte hash (P2WPKH)
    const pubkeyHash = crypto.randomBytes(20);
    
    // Convert to 5-bit groups for Bech32 encoding
    const fiveBitData = this.convertTo5Bit(pubkeyHash);
    
    // Create witness version 0 program
    const data = [0, ...fiveBitData];
    
    // Calculate checksum
    const checksum = this.bech32Checksum('tb', data);
    
    // Combine all parts
    const combined = [...data, ...checksum];
    
    // Convert to Bech32 characters
    const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    const encoded = combined.map(x => charset[x]).join('');
    
    return 'tb1' + encoded;
  }

  /**
   * Convert 8-bit bytes to 5-bit groups for Bech32
   */
  private convertTo5Bit(data: Buffer): number[] {
    const result: number[] = [];
    let acc = 0;
    let bits = 0;
    
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      acc = (acc << 8) | byte;
      bits += 8;
      
      while (bits >= 5) {
        bits -= 5;
        result.push((acc >> bits) & 31);
      }
    }
    
    if (bits > 0) {
      result.push((acc << (5 - bits)) & 31);
    }
    
    return result;
  }

  /**
   * Calculate Bech32 checksum
   */
  private bech32Checksum(hrp: string, data: number[]): number[] {
    const values = this.hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
    const mod = this.polymod(values) ^ 1;
    const checksum: number[] = [];
    
    for (let i = 0; i < 6; i++) {
      checksum.push((mod >> (5 * (5 - i))) & 31);
    }
    
    return checksum;
  }

  /**
   * Expand human readable part for checksum calculation
   */
  private hrpExpand(hrp: string): number[] {
    const ret: number[] = [];
    for (let i = 0; i < hrp.length; i++) {
      ret.push(hrp.charCodeAt(i) >> 5);
    }
    ret.push(0);
    for (let i = 0; i < hrp.length; i++) {
      ret.push(hrp.charCodeAt(i) & 31);
    }
    return ret;
  }

  /**
   * Bech32 polymod function
   */
  private polymod(values: number[]): number {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    
    for (const value of values) {
      const top = chk >> 25;
      chk = (chk & 0x1ffffff) << 5 ^ value;
      for (let i = 0; i < 5; i++) {
        chk ^= ((top >> i) & 1) ? GEN[i] : 0;
      }
    }
    
    return chk;
  }

  /**
   * Generates a realistic-looking testnet transaction hash
   */
  private generateMockTxHash(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

/**
 * Recommendation for production implementation:
 * 
 * For a production Bitcoin escrow system, consider:
 * 
 * 1. **Sparrow Integration**: Sparrow is an excellent desktop wallet but not suitable 
 *    for automated server-side escrow. It's designed for manual user operations.
 * 
 * 2. **Recommended Approach**: Build internal escrow using:
 *    - bitcoinjs-lib for transaction creation/signing
 *    - Bitcoin Core node for blockchain interaction
 *    - 2-of-3 multisig: Borrower + Platform + Arbiter keys
 *    - Hardware Security Modules (HSM) for key management
 * 
 * 3. **Alternative Services**:
 *    - BitGo API for enterprise Bitcoin custody
 *    - Blockstream Green for multisig solutions
 *    - Coinbase Custody for institutional-grade security
 * 
 * 4. **Security Considerations**:
 *    - Never store private keys in plain text
 *    - Use time-locked contracts for automatic releases
 *    - Implement proper key rotation policies
 *    - Regular security audits and penetration testing
 */