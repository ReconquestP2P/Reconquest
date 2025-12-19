/**
 * Collateral Release Service
 * 
 * Handles the automatic release of Bitcoin collateral when a loan is repaid.
 * Uses the platform's signing key combined with either borrower or lender signatures
 * to create a valid 2-of-3 multisig transaction and broadcast to testnet4.
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { BitcoinEscrowService } from './BitcoinEscrowService.js';
import type { IStorage } from '../storage.js';

bitcoin.initEccLib(ecc);

const TESTNET4_NETWORK = bitcoin.networks.testnet;

export interface ReleaseResult {
  success: boolean;
  txid?: string;
  error?: string;
  broadcastUrl?: string;
}

interface UTXOInfo {
  txid: string;
  vout: number;
  value: number;
}

/**
 * Fetch UTXOs for an address from mempool.space testnet4 API
 */
async function fetchUTXOs(address: string): Promise<UTXOInfo[]> {
  const axios = (await import('axios')).default;
  
  try {
    const response = await axios.get(
      `https://mempool.space/testnet4/api/address/${address}/utxo`,
      { timeout: 15000 }
    );
    
    return response.data.map((utxo: any) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
    }));
  } catch (error: any) {
    console.error('Failed to fetch UTXOs:', error.message);
    return [];
  }
}

/**
 * Broadcast transaction to testnet4 via mempool.space
 */
async function broadcastToTestnet4(txHex: string): Promise<string> {
  const axios = (await import('axios')).default;
  
  console.log('📡 Broadcasting to Mempool.space testnet4...');
  console.log(`   Transaction size: ${txHex.length / 2} bytes`);
  
  const response = await axios.post(
    'https://mempool.space/testnet4/api/tx',
    txHex,
    {
      headers: { 'Content-Type': 'text/plain' },
      timeout: 30000,
    }
  );
  
  const txid = response.data;
  console.log(`✅ Broadcast successful: ${txid}`);
  return txid;
}

/**
 * Build witness script from sorted public keys for 2-of-3 multisig
 */
function buildWitnessScript(pubkeys: string[]): Buffer {
  const sortedPubkeys = [...pubkeys].sort();
  
  const script: number[] = [];
  script.push(0x52); // OP_2
  
  for (const pubkeyHex of sortedPubkeys) {
    const pubkeyBytes = Buffer.from(pubkeyHex, 'hex');
    script.push(pubkeyBytes.length);
    script.push(...Array.from(pubkeyBytes));
  }
  
  script.push(0x53); // OP_3
  script.push(0xae); // OP_CHECKMULTISIG
  
  return Buffer.from(script);
}

/**
 * Sign a PSBT input with a private key
 */
function signPsbtInput(
  psbt: bitcoin.Psbt,
  inputIndex: number,
  privateKeyHex: string,
  witnessScript: Buffer
): void {
  const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');
  const keyPair = {
    publicKey: Buffer.from(ecc.pointFromScalar(privateKeyBuffer, true)!),
    privateKey: privateKeyBuffer,
    sign: (hash: Buffer) => Buffer.from(ecc.sign(hash, privateKeyBuffer)),
  };
  
  psbt.signInput(inputIndex, keyPair);
}

/**
 * Create and broadcast a cooperative close transaction
 * This releases the borrower's collateral after successful loan repayment
 */
export async function releaseCollateral(
  storage: IStorage,
  loanId: number
): Promise<ReleaseResult> {
  console.log(`🔐 Starting collateral release for loan #${loanId}`);
  
  try {
    const loan = await storage.getLoan(loanId);
    if (!loan) {
      return { success: false, error: 'Loan not found' };
    }
    
    if (!loan.escrowAddress) {
      return { success: false, error: 'No escrow address found' };
    }
    
    // Get borrower's BTC return address from user record
    const borrower = await storage.getUser(loan.borrowerId);
    if (!borrower || !borrower.btcAddress) {
      return { success: false, error: 'No borrower return address found' };
    }
    
    // Get escrow details
    const escrowAddress = loan.escrowAddress;
    const witnessScriptHex = loan.escrowWitnessScript;
    const borrowerReturnAddress = borrower.btcAddress;
    
    if (!witnessScriptHex) {
      return { success: false, error: 'No witness script found for escrow' };
    }
    
    // Fetch UTXOs from escrow
    console.log(`📡 Fetching UTXOs from escrow: ${escrowAddress}`);
    const utxos = await fetchUTXOs(escrowAddress);
    
    if (utxos.length === 0) {
      return { success: false, error: 'No UTXOs found in escrow address' };
    }
    
    const utxo = utxos[0];
    console.log(`   Found UTXO: ${utxo.txid}:${utxo.vout} (${utxo.value} sats)`);
    
    // Get keys - we need 2 of 3
    const platformPrivateKey = BitcoinEscrowService.getPlatformPrivateKey();
    const platformPubkey = BitcoinEscrowService.PLATFORM_PUBLIC_KEY;
    
    // Get the stored public keys from the loan
    const borrowerPubkey = loan.borrowerPubkey;
    const lenderPubkey = loan.lenderPubkey;
    
    if (!borrowerPubkey && !lenderPubkey) {
      return { success: false, error: 'No signing keys available' };
    }
    
    // Build witness script for signing
    const pubkeys = [
      borrowerPubkey || platformPubkey,
      lenderPubkey || platformPubkey,
      platformPubkey,
    ].filter(Boolean) as string[];
    
    const witnessScript = Buffer.from(witnessScriptHex, 'hex');
    
    // Calculate fee (1 sat/vB for testnet)
    const estimatedVsize = 180; // Approximate vsize for 2-of-3 multisig spend
    const fee = estimatedVsize;
    const outputValue = utxo.value - fee;
    
    if (outputValue <= 0) {
      return { success: false, error: 'UTXO value too small to cover fee' };
    }
    
    console.log(`💰 Creating transaction: ${utxo.value} - ${fee} = ${outputValue} sats`);
    console.log(`   Destination: ${borrowerReturnAddress}`);
    
    // Create PSBT
    const psbt = new bitcoin.Psbt({ network: TESTNET4_NETWORK });
    
    // Add input with witness UTXO
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: bitcoin.payments.p2wsh({
          redeem: { output: witnessScript, network: TESTNET4_NETWORK },
          network: TESTNET4_NETWORK,
        }).output!,
        value: BigInt(utxo.value),
      },
      witnessScript: witnessScript,
    });
    
    // Add output to borrower
    psbt.addOutput({
      address: borrowerReturnAddress,
      value: BigInt(outputValue),
    });
    
    // Sign with platform key (we always have this)
    console.log(`🔑 Signing with platform key...`);
    signPsbtInput(psbt, 0, platformPrivateKey, witnessScript);
    
    // For testnet MVP: Check if we have both keys as platform key (simplified 2-of-3)
    // In production, we'd need signatures from borrower/lender
    // For now, we'll check if the multisig was created with platform key duplicated
    
    // Check if we can finalize with just platform signature
    // This would work if platform key was used twice in the multisig
    const sortedPubkeys = [...pubkeys].sort();
    const platformKeyCount = sortedPubkeys.filter(pk => pk === platformPubkey).length;
    
    if (platformKeyCount >= 2) {
      // Platform has 2 of 3 keys - sign again and finalize
      console.log(`🔑 Platform controls 2 of 3 keys - signing again...`);
      // Already signed once, need to finalize
      try {
        psbt.finalizeAllInputs();
        const tx = psbt.extractTransaction();
        const txHex = tx.toHex();
        const txid = tx.getId();
        
        console.log(`✅ Transaction finalized: ${txid}`);
        
        // Broadcast
        const broadcastTxid = await broadcastToTestnet4(txHex);
        
        return {
          success: true,
          txid: broadcastTxid,
          broadcastUrl: `https://mempool.space/testnet4/tx/${broadcastTxid}`,
        };
      } catch (finalizeError: any) {
        console.error('Failed to finalize with platform-only signatures:', finalizeError.message);
      }
    }
    
    // Need to get stored signatures from pre_signed_transactions
    console.log(`🔐 Looking for stored signatures from borrower/lender...`);
    const preSignedTxs = await storage.getPreSignedTransactions(loanId, 'cooperative_close');
    
    // Check if we have real PSBTs with signatures
    for (const tx of preSignedTxs) {
      if (tx.partyRole === 'platform') continue;
      
      if (tx.psbt && tx.psbt.length > 100) {
        try {
          const storedPsbt = bitcoin.Psbt.fromBase64(tx.psbt);
          
          // Check if this PSBT has signatures for the same input
          if (storedPsbt.data.inputs[0]?.partialSig) {
            console.log(`   Found ${tx.partyRole} signature in stored PSBT`);
            
            // Combine PSBTs
            psbt.combine(storedPsbt);
          }
        } catch (parseError: any) {
          console.warn(`   Could not parse ${tx.partyRole} PSBT: ${parseError.message}`);
        }
      }
    }
    
    // Try to finalize
    try {
      psbt.finalizeAllInputs();
      const tx = psbt.extractTransaction();
      const txHex = tx.toHex();
      const txid = tx.getId();
      
      console.log(`✅ Transaction finalized with combined signatures: ${txid}`);
      
      // Broadcast
      const broadcastTxid = await broadcastToTestnet4(txHex);
      
      return {
        success: true,
        txid: broadcastTxid,
        broadcastUrl: `https://mempool.space/testnet4/tx/${broadcastTxid}`,
      };
    } catch (finalizeError: any) {
      console.error('Failed to finalize transaction:', finalizeError.message);
      
      return {
        success: false,
        error: `Could not finalize transaction: ${finalizeError.message}. Need 2 of 3 signatures.`,
      };
    }
    
  } catch (error: any) {
    console.error('Collateral release error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error during collateral release',
    };
  }
}
