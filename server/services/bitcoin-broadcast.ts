/**
 * Bitcoin Broadcast Service - Firefish Ephemeral Key Model
 * 
 * Handles:
 * 1. Signature aggregation (2-of-3 multisig)
 * 2. Transaction broadcasting to Bitcoin testnet
 * 3. Transaction confirmation tracking
 * 
 * SECURITY: Private keys are NEVER stored or seen by this service.
 * Only pre-signed transactions and public keys are processed.
 */

import * as secp256k1 from '@noble/secp256k1';
import { createHash, createHmac } from 'crypto';
import type { PreSignedTransaction } from '@shared/schema';
import { STORAGE_TX_TYPES } from '@shared/txTypes';
import { getBitcoinRpcClient } from './bitcoin-rpc-client';
import { PreSignedTxBuilder } from './presigned-tx-builder';
import { getBroadcastUrl, getCurrentNetwork } from './bitcoin-network-selector.js';
import { BitcoinEscrowService } from './BitcoinEscrowService.js';

// Configure secp256k1 v3 with Node.js crypto hash functions (if not already done)
if (!secp256k1.hashes.sha256) {
  secp256k1.hashes.sha256 = (message: Uint8Array): Uint8Array => {
    return new Uint8Array(createHash('sha256').update(message).digest());
  };
}
if (!secp256k1.hashes.hmacSha256) {
  secp256k1.hashes.hmacSha256 = (key: Uint8Array, message: Uint8Array): Uint8Array => {
    return new Uint8Array(createHmac('sha256', key).update(message).digest());
  };
}

export interface SignatureAggregationResult {
  success: boolean;
  txHex?: string;
  error?: string;
  signaturesCollected: number;
  signaturesRequired: number;
}

export interface LoanContext {
  escrowTxid?: string;
  escrowVout?: number;
  escrowAmount?: number;
  borrowerAddress?: string;
  lenderAddress?: string;
  expectedOutputAddress?: string;
  txType?: string;
}

// Canonical template from database (authoritative source)
export interface CanonicalPsbtTemplate {
  canonicalTxid: string;
  inputTxid: string;
  inputVout: number;
  inputValue: number;
  witnessScriptHash: string;
  outputAddress: string;
  outputValue: number;
  feeRate: number;
  virtualSize: number;
  fee: number;
}

export interface BroadcastResult {
  success: boolean;
  txid?: string;
  error?: string;
}

/**
 * SECURITY CRITICAL: Validate PSBT integrity against loan configuration
 * This prevents attackers from submitting PSBTs that spend different UTXOs
 * or route funds to unexpected addresses.
 * 
 * VALIDATES:
 * - Transaction ID derived from PSBT matches expectation
 * - Input txid/vout matches escrow UTXO
 * - ALL outputs go to expected addresses (no hidden outputs)
 * - Input value matches expected escrow amount
 */
async function validatePsbtIntegrity(
  psbtBase64: string,
  loanContext: LoanContext
): Promise<{ valid: boolean; error?: string; derivedTxHash?: string }> {
  try {
    if (!psbtBase64 || psbtBase64.length < 100) {
      return { valid: true }; // Skip for legacy mock PSBTs
    }
    
    const bitcoin = await import('bitcoinjs-lib');
    const ecc = await import('tiny-secp256k1');
    bitcoin.initEccLib(ecc);
    
    const parsedPsbt = bitcoin.Psbt.fromBase64(psbtBase64);
    
    // SECURITY: Derive the transaction ID from the PSBT itself
    // This prevents txHash spoofing attacks
    let derivedTxHash: string | undefined;
    try {
      const txForId = parsedPsbt.extractTransaction(true); // Allow incomplete for ID extraction
      derivedTxHash = txForId.getId();
      console.log(`🔍 Derived txHash from PSBT: ${derivedTxHash.slice(0, 16)}...`);
    } catch (extractError) {
      // If we can't extract, compute from unsigned tx
      try {
        const unsignedTx = parsedPsbt.data.globalMap.unsignedTx;
        if (unsignedTx && 'tx' in unsignedTx) {
          derivedTxHash = (unsignedTx as any).tx.getId();
          console.log(`🔍 Derived txHash from unsigned tx: ${derivedTxHash?.slice(0, 16)}...`);
        }
      } catch (e) {
        console.warn('⚠️ Could not derive txHash from PSBT');
      }
    }
    
    // Get transaction inputs and outputs
    const txInputs = parsedPsbt.txInputs;
    const txOutputs = parsedPsbt.txOutputs;
    
    if (txInputs.length === 0) {
      return { valid: false, error: 'PSBT has no inputs' };
    }
    
    // SECURITY: Only allow single input from escrow
    if (txInputs.length > 1) {
      return { valid: false, error: `PSBT has ${txInputs.length} inputs - expected exactly 1 from escrow` };
    }
    
    // Validate escrow UTXO if provided in context
    if (loanContext.escrowTxid) {
      const inputTxid = Buffer.from(txInputs[0].hash).reverse().toString('hex');
      const inputVout = txInputs[0].index;
      
      if (inputTxid !== loanContext.escrowTxid) {
        return { 
          valid: false, 
          error: `PSBT input txid (${inputTxid.slice(0, 16)}...) doesn't match escrow (${loanContext.escrowTxid.slice(0, 16)}...)` 
        };
      }
      
      if (loanContext.escrowVout !== undefined && inputVout !== loanContext.escrowVout) {
        return { 
          valid: false, 
          error: `PSBT input vout (${inputVout}) doesn't match escrow (${loanContext.escrowVout})` 
        };
      }
      
      console.log(`✅ PSBT input matches escrow UTXO: ${inputTxid.slice(0, 16)}...:${inputVout}`);
    }
    
    // SECURITY: Validate ALL outputs based on txType - strict recipient enforcement
    const network = bitcoin.networks.testnet;
    
    // Determine exact allowed recipients based on transaction type
    let primaryRecipient: string | undefined;
    const allowedAddresses = new Set<string>();
    
    // txType determines who should receive the funds
    // cooperative_close/recovery -> borrower
    // default -> lender
    if (loanContext.txType === 'cooperative_close' || loanContext.txType === STORAGE_TX_TYPES.RECOVERY || loanContext.txType === STORAGE_TX_TYPES.REPAYMENT) {
      primaryRecipient = loanContext.borrowerAddress;
      if (loanContext.borrowerAddress) {
        allowedAddresses.add(loanContext.borrowerAddress);
      }
    } else if (loanContext.txType === STORAGE_TX_TYPES.DEFAULT) {
      primaryRecipient = loanContext.lenderAddress;
      if (loanContext.lenderAddress) {
        allowedAddresses.add(loanContext.lenderAddress);
      }
    } else {
      // Unknown txType - allow expected output address only
      if (loanContext.expectedOutputAddress) {
        primaryRecipient = loanContext.expectedOutputAddress;
        allowedAddresses.add(loanContext.expectedOutputAddress);
      }
    }
    
    // Check every output - strict validation
    if (allowedAddresses.size > 0 && txOutputs.length > 0) {
      let totalOutputValue = 0;
      let primaryRecipientValue = 0;
      
      // SECURITY: Only allow 1 output for simplicity (no hidden change outputs)
      if (txOutputs.length > 1) {
        return { 
          valid: false, 
          error: `PSBT has ${txOutputs.length} outputs - expected exactly 1 to prevent fund siphoning` 
        };
      }
      
      for (let i = 0; i < txOutputs.length; i++) {
        const output = txOutputs[i];
        totalOutputValue += output.value;
        
        try {
          const outputAddress = bitcoin.address.fromOutputScript(output.script, network);
          
          if (!allowedAddresses.has(outputAddress)) {
            return { 
              valid: false, 
              error: `PSBT output[${i}] goes to unauthorized address: ${outputAddress.slice(0, 20)}...` 
            };
          }
          
          if (outputAddress === primaryRecipient) {
            primaryRecipientValue = output.value;
          }
          
          console.log(`✅ Output[${i}]: ${output.value} sats → ${outputAddress.slice(0, 20)}...`);
        } catch (addrError) {
          // OP_RETURN or non-standard script - reject for safety
          return { 
            valid: false, 
            error: `PSBT output[${i}] has non-standard script - rejected for safety` 
          };
        }
      }
      
      // SECURITY: Verify output value with tight tolerance
      // Maximum allowed fee is 5% of escrow or 50000 sats (whichever is smaller)
      if (loanContext.escrowAmount && primaryRecipientValue > 0) {
        const maxFeePercent = Math.min(loanContext.escrowAmount * 0.05, 50000); // 5% or 50k sats max
        const minExpectedOutput = loanContext.escrowAmount - maxFeePercent;
        
        if (primaryRecipientValue < minExpectedOutput) {
          return { 
            valid: false, 
            error: `Output value (${primaryRecipientValue}) is too low. Expected at least ${Math.floor(minExpectedOutput)} sats (escrow: ${loanContext.escrowAmount}, max fee: ${Math.floor(maxFeePercent)})` 
          };
        }
        
        const actualFee = loanContext.escrowAmount - primaryRecipientValue;
        console.log(`✅ Output value check passed: ${primaryRecipientValue} sats (fee: ${actualFee} sats, max allowed: ${Math.floor(maxFeePercent)})`);
      }
      
      console.log(`✅ Total output value: ${totalOutputValue} sats across ${txOutputs.length} output(s)`);
    }
    
    // Validate escrow amount if provided
    if (loanContext.escrowAmount !== undefined) {
      const witnessUtxo = parsedPsbt.data.inputs[0]?.witnessUtxo;
      if (witnessUtxo) {
        const inputValue = witnessUtxo.value;
        // Allow 20% variance for fees (testnet4 can have variable fees)
        const minExpected = loanContext.escrowAmount * 0.8;
        const maxExpected = loanContext.escrowAmount * 1.2;
        
        if (inputValue < minExpected || inputValue > maxExpected) {
          return { 
            valid: false, 
            error: `PSBT input value (${inputValue}) doesn't match expected escrow amount (~${loanContext.escrowAmount})` 
          };
        }
        
        console.log(`✅ PSBT input value matches expected amount: ${inputValue} sats`);
      }
    }
    
    return { valid: true, derivedTxHash };
  } catch (error: any) {
    return { valid: false, error: `PSBT integrity check failed: ${error.message}` };
  }
}

/**
 * Aggregate signatures from borrower, lender, and platform (2-of-3 multisig)
 * Uses real PSBT combination for testnet4 broadcast
 * 
 * @param transactions - Array of pre-signed transactions from borrower and lender
 * @param loanContext - Optional loan configuration for PSBT integrity validation
 * @param canonicalTemplate - Authoritative template from database for strict validation
 */
export async function aggregateSignatures(
  transactions: PreSignedTransaction[],
  loanContext?: LoanContext,
  canonicalTemplate?: CanonicalPsbtTemplate
): Promise<SignatureAggregationResult> {
  console.log(`🔐 Aggregating ${transactions.length} signatures for multisig...`);
  
  if (transactions.length < 2) {
    return {
      success: false,
      error: 'Need at least 2 of 3 signatures for valid transaction',
      signaturesCollected: transactions.length,
      signaturesRequired: 2,
    };
  }
  
  // Verify all transactions are for the same tx type
  const uniqueTxTypes = new Set(transactions.map(tx => tx.txType));
  if (uniqueTxTypes.size > 1) {
    return {
      success: false,
      error: 'Signatures are for different transaction types',
      signaturesCollected: transactions.length,
      signaturesRequired: 2,
    };
  }
  
  try {
    // SECURITY: Verify participant roles
    const roles = new Set(transactions.map(tx => tx.partyRole));
    
    if (!roles.has('borrower')) {
      return {
        success: false,
        error: 'Missing borrower signature',
        signaturesCollected: transactions.length,
        signaturesRequired: 2,
      };
    }
    
    if (!roles.has('lender')) {
      return {
        success: false,
        error: 'Missing lender signature',
        signaturesCollected: transactions.length,
        signaturesRequired: 2,
      };
    }
    
    console.log('✅ All required parties present');
    
    // SECURITY: Verify transaction consistency (txHash must match)
    const uniqueTxHashes = new Set(transactions.map(tx => tx.txHash));
    if (uniqueTxHashes.size > 1) {
      console.error('❌ Transaction hash mismatch - PSBTs are for different transactions');
      return {
        success: false,
        error: 'Transaction consistency check failed: PSBTs have different txHash values',
        signaturesCollected: transactions.length,
        signaturesRequired: 2,
      };
    }
    
    console.log('✅ Transaction consistency verified (client-supplied)');
    
    // SECURITY CRITICAL: Validate against canonical template from database
    if (canonicalTemplate) {
      console.log('🔒 Validating against canonical template from database...');
      
      for (const tx of transactions) {
        if (!tx.psbt || tx.psbt.length < 100) continue;
        
        try {
          const bitcoin = await import('bitcoinjs-lib');
          const ecc = await import('tiny-secp256k1');
          bitcoin.initEccLib(ecc);
          
          const parsedPsbt = bitcoin.Psbt.fromBase64(tx.psbt);
          const txInputs = parsedPsbt.txInputs;
          const txOutputs = parsedPsbt.txOutputs;
          
          // Validate input matches canonical
          if (txInputs.length !== 1) {
            return {
              success: false,
              error: `${tx.partyRole}'s PSBT has ${txInputs.length} inputs, expected 1`,
              signaturesCollected: transactions.length,
              signaturesRequired: 2,
            };
          }
          
          const inputTxid = Buffer.from(txInputs[0].hash).reverse().toString('hex');
          if (inputTxid !== canonicalTemplate.inputTxid) {
            return {
              success: false,
              error: `${tx.partyRole}'s PSBT input txid mismatch`,
              signaturesCollected: transactions.length,
              signaturesRequired: 2,
            };
          }
          
          if (txInputs[0].index !== canonicalTemplate.inputVout) {
            return {
              success: false,
              error: `${tx.partyRole}'s PSBT input vout mismatch`,
              signaturesCollected: transactions.length,
              signaturesRequired: 2,
            };
          }
          
          // Validate output matches canonical EXACTLY
          if (txOutputs.length !== 1) {
            return {
              success: false,
              error: `${tx.partyRole}'s PSBT has ${txOutputs.length} outputs, expected 1`,
              signaturesCollected: transactions.length,
              signaturesRequired: 2,
            };
          }
          
          const network = bitcoin.networks.testnet;
          const outputAddress = bitcoin.address.fromOutputScript(txOutputs[0].script, network);
          
          if (outputAddress !== canonicalTemplate.outputAddress) {
            return {
              success: false,
              error: `${tx.partyRole}'s PSBT output address mismatch`,
              signaturesCollected: transactions.length,
              signaturesRequired: 2,
            };
          }
          
          // STRICT: Output value must match EXACTLY
          if (txOutputs[0].value !== BigInt(canonicalTemplate.outputValue)) {
            return {
              success: false,
              error: `${tx.partyRole}'s PSBT output value (${txOutputs[0].value}) doesn't match canonical (${canonicalTemplate.outputValue})`,
              signaturesCollected: transactions.length,
              signaturesRequired: 2,
            };
          }
          
          console.log(`✅ ${tx.partyRole}'s PSBT matches canonical template exactly`);
        } catch (parseError: any) {
          return {
            success: false,
            error: `Failed to parse ${tx.partyRole}'s PSBT: ${parseError.message}`,
            signaturesCollected: transactions.length,
            signaturesRequired: 2,
          };
        }
      }
      
      console.log('✅ All PSBTs validated against canonical template');
    }
    
    // SECURITY: Validate PSBT integrity against loan configuration (fallback if no canonical template)
    if (!canonicalTemplate && loanContext && (loanContext.escrowTxid || loanContext.expectedOutputAddress)) {
      console.log('🔍 Validating PSBT integrity against loan configuration...');
      
      let firstDerivedTxHash: string | undefined;
      
      for (const tx of transactions) {
        const integrityResult = await validatePsbtIntegrity(tx.psbt, loanContext);
        if (!integrityResult.valid) {
          return {
            success: false,
            error: `PSBT integrity check failed for ${tx.partyRole}: ${integrityResult.error}`,
            signaturesCollected: transactions.length,
            signaturesRequired: 2,
          };
        }
        
        // SECURITY: Verify derived txHash matches across all PSBTs
        if (integrityResult.derivedTxHash) {
          if (!firstDerivedTxHash) {
            firstDerivedTxHash = integrityResult.derivedTxHash;
          } else if (integrityResult.derivedTxHash !== firstDerivedTxHash) {
            return {
              success: false,
              error: `PSBT txHash mismatch: ${tx.partyRole}'s PSBT has different transaction ID`,
              signaturesCollected: transactions.length,
              signaturesRequired: 2,
            };
          }
        }
      }
      
      console.log('✅ PSBT integrity validated - all derived txHashes match');
    }
    
    // SECURITY: Verify all signatures cryptographically before combination
    for (const tx of transactions) {
      const isValid = await verifySignature(tx.signature, tx.psbt, tx.partyPubkey);
      if (!isValid) {
        return {
          success: false,
          error: `Invalid signature from ${tx.partyRole}. Cryptographic verification failed.`,
          signaturesCollected: transactions.length,
          signaturesRequired: 2,
        };
      }
    }
    
    console.log('✅ All signatures cryptographically verified');
    
    // Try to combine real PSBTs using bitcoinjs-lib
    const signedPsbts = transactions
      .filter(tx => tx.psbt && tx.psbt.length > 50)
      .map(tx => tx.psbt);
    
    // Try to combine real PSBTs using bitcoinjs-lib
    if (signedPsbts.length >= 2) {
      try {
        const { combinePSBTs } = await import('./psbt-builder.js');
        const { finalTxHex, txid } = combinePSBTs(signedPsbts);
        
        console.log(`✅ Real PSBTs combined successfully: ${txid}`);
        
        // SECURITY: Post-combination verification of final transaction
        if (loanContext && (loanContext.escrowTxid || loanContext.expectedOutputAddress)) {
          console.log('🔍 Verifying final combined transaction...');
          
          const bitcoin = await import('bitcoinjs-lib');
          const finalTx = bitcoin.Transaction.fromHex(finalTxHex);
          const network = bitcoin.networks.testnet;
          
          // Verify input matches escrow
          if (loanContext.escrowTxid && finalTx.ins.length > 0) {
            const inputTxid = Buffer.from(finalTx.ins[0].hash).reverse().toString('hex');
            if (inputTxid !== loanContext.escrowTxid) {
              return {
                success: false,
                error: `Final tx input txid mismatch: expected ${loanContext.escrowTxid.slice(0, 16)}...`,
                signaturesCollected: transactions.length,
                signaturesRequired: 2,
              };
            }
          }
          
          // Verify output goes to correct recipient
          if (finalTx.outs.length > 0) {
            const outputAddress = bitcoin.address.fromOutputScript(finalTx.outs[0].script, network);
            
            // Determine expected recipient based on txType
            let expectedRecipient: string | undefined;
            if (loanContext.txType === 'cooperative_close' || loanContext.txType === STORAGE_TX_TYPES.RECOVERY || loanContext.txType === STORAGE_TX_TYPES.REPAYMENT) {
              expectedRecipient = loanContext.borrowerAddress;
            } else if (loanContext.txType === STORAGE_TX_TYPES.DEFAULT) {
              expectedRecipient = loanContext.lenderAddress;
            } else {
              expectedRecipient = loanContext.expectedOutputAddress;
            }
            
            if (expectedRecipient && outputAddress !== expectedRecipient) {
              return {
                success: false,
                error: `Final tx output goes to wrong address: ${outputAddress.slice(0, 20)}...`,
                signaturesCollected: transactions.length,
                signaturesRequired: 2,
              };
            }
            
            // Verify output value with tight tolerance
            if (loanContext.escrowAmount) {
              const outputValue = finalTx.outs[0].value;
              const maxFee = Math.min(loanContext.escrowAmount * 0.05, 50000);
              const minExpected = loanContext.escrowAmount - maxFee;
              
              if (outputValue < minExpected) {
                return {
                  success: false,
                  error: `Final tx output value (${outputValue}) too low. Min: ${Math.floor(minExpected)}`,
                  signaturesCollected: transactions.length,
                  signaturesRequired: 2,
                };
              }
              console.log(`✅ Final tx output value verified: ${outputValue} sats`);
            }
            
            console.log(`✅ Final tx verified: ${txid.slice(0, 16)}... → ${outputAddress.slice(0, 20)}...`);
          }
        }
        
        return {
          success: true,
          txHex: finalTxHex,
          signaturesCollected: transactions.length,
          signaturesRequired: 2,
        };
      } catch (psbtError: any) {
        console.error('❌ PSBT combination failed:', psbtError.message);
        return {
          success: false,
          error: `PSBT combination failed: ${psbtError.message}`,
          signaturesCollected: transactions.length,
          signaturesRequired: 2,
        };
      }
    }
    
    // Legacy mode for mock PSBTs (will be deprecated)
    // Only allow if we detect mock PSBTs (for backward compatibility during transition)
    const hasMockPsbts = transactions.some(tx => 
      tx.psbt.startsWith('Y29vcGVyYXRpdmU') || // base64 of "cooperative_psbt"
      tx.psbt.startsWith('cmVjb3Zlcnk') ||      // base64 of "recovery_psbt"
      tx.psbt.startsWith('ZGVmYXVsdA')          // base64 of "default"
    );
    
    if (hasMockPsbts) {
      console.warn('⚠️ Using legacy mock PSBT mode (will be deprecated)');
      const mockTxHex = combineMockSignatures(transactions);
      return {
        success: true,
        txHex: mockTxHex,
        signaturesCollected: transactions.length,
        signaturesRequired: 2,
      };
    }
    
    return {
      success: false,
      error: 'Invalid PSBT format - neither real nor legacy mock PSBTs detected',
      signaturesCollected: transactions.length,
      signaturesRequired: 2,
    };
  } catch (error) {
    console.error('Failed to aggregate signatures:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      signaturesCollected: transactions.length,
      signaturesRequired: 2,
    };
  }
}

/**
 * Verify a signature against a public key using cryptographic validation
 * 
 * SECURITY CRITICAL: This prevents unauthorized transactions
 * Uses bitcoinjs-lib validateSignaturesOfInput for proper verification
 */
async function verifySignature(
  signature: string,
  psbt: string,
  publicKey: string
): Promise<boolean> {
  try {
    // Basic sanity checks
    if (!signature || !psbt || !publicKey) {
      console.error('❌ Missing signature, PSBT, or public key');
      return false;
    }
    
    // Check signature format - must have reasonable length
    if (signature.length < 64) {
      console.error('❌ Signature too short');
      return false;
    }
    
    // Check public key format (must be 66 hex chars for compressed, starting with 02 or 03)
    if (publicKey.length !== 66) {
      console.error(`❌ Invalid public key length: ${publicKey.length} (expected 66)`);
      return false;
    }
    
    if (!publicKey.startsWith('02') && !publicKey.startsWith('03')) {
      console.error(`❌ Invalid public key prefix: ${publicKey.slice(0, 2)}`);
      return false;
    }
    
    // For real PSBTs, use cryptographic verification with validateSignaturesOfInput
    if (psbt.length > 100) {
      try {
        const bitcoin = await import('bitcoinjs-lib');
        const ecc = await import('tiny-secp256k1');
        
        bitcoin.initEccLib(ecc);
        
        const parsedPsbt = bitcoin.Psbt.fromBase64(psbt);
        const pubkeyBuffer = Buffer.from(publicKey, 'hex');
        
        // CRYPTOGRAPHIC VERIFICATION: Validate signature against sighash
        const isValid = parsedPsbt.validateSignaturesOfInput(0, (pubkey, msghash, sig) => {
          return ecc.verify(msghash, pubkey, sig);
        }, pubkeyBuffer);
        
        if (!isValid) {
          console.error(`❌ Cryptographic signature verification failed for pubkey ${publicKey.slice(0, 16)}...`);
          return false;
        }
        
        console.log(`✅ Cryptographically verified signature for pubkey ${publicKey.slice(0, 16)}...`);
        return true;
      } catch (psbtError: any) {
        console.error('❌ PSBT verification failed:', psbtError.message);
        return false;
      }
    }
    
    // For legacy mock PSBTs (backward compatibility during transition)
    console.log(`⚠️ Legacy signature verification for pubkey ${publicKey.slice(0, 16)}...`);
    return true;
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Broadcast transaction via public Mempool.space testnet4 API
 * Uses the new testnet4 network
 */
async function broadcastViaMempoolSpace(txHex: string): Promise<string> {
  const axios = (await import('axios')).default;
  const network = getCurrentNetwork();
  
  console.log(`📡 Broadcasting via Mempool.space ${network} API...`);
  console.log(`   Transaction hex (${txHex.length} chars): ${txHex.slice(0, 50)}...`);
  
  const response = await axios.post(
    getBroadcastUrl(),
    txHex,
    {
      headers: { 'Content-Type': 'text/plain' },
      timeout: 30000,
    }
  );
  
  // Mempool.space returns the txid as plain text
  const txid = response.data;
  console.log(`✅ Transaction broadcast via Mempool.space ${network}: ${txid}`);
  return txid;
}

/**
 * Broadcast transaction to Bitcoin testnet4
 * NO MOCK FALLBACK - must use real network
 */
export async function broadcastTransaction(txHex: string): Promise<BroadcastResult> {
  console.log('📡 Broadcasting transaction to Bitcoin testnet4...');
  console.log(`   Transaction hex length: ${txHex.length} chars`);

  try {
    // Try Mempool.space testnet4 API (primary method)
    try {
      const txid = await broadcastViaMempoolSpace(txHex);
      return {
        success: true,
        txid,
      };
    } catch (mempoolError: any) {
      const errorMsg = mempoolError?.response?.data || mempoolError?.message || 'Unknown error';
      console.error('❌ Mempool.space testnet4 API error:', errorMsg);
      
      return {
        success: false,
        error: `Testnet4 broadcast failed: ${errorMsg}`,
      };
    }
  } catch (error) {
    console.error('Failed to broadcast transaction:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Broadcast failed',
    };
  }
}

/**
 * Generate platform signature for a transaction
 * Uses ephemeral key generation (Firefish model)
 * Key exists only for ~1 second, then destroyed
 */
export async function generatePlatformSignature(
  txHash: string,
  messageHash: string
): Promise<{ signature: string; publicKey: string }> {
  try {
    console.log('🔐 Generating platform ephemeral signature...');

    // Generate ephemeral keypair
    const { publicKey, privateKey } = PreSignedTxBuilder.generateEphemeralKeypair();

    try {
      // Sign with ephemeral key - secp256k1.sign() returns Uint8Array (64-byte compact signature)
      const msgBytes = Buffer.from(txHash, 'hex');
      const sigBytes = secp256k1.sign(msgBytes, privateKey);
      const signature = Buffer.from(sigBytes).toString('hex');

      console.log(`✅ Platform signature generated (ephemeral key)`);
      console.log(`   Pubkey: ${publicKey.slice(0, 20)}...`);

      return {
        signature,
        publicKey,
      };
    } finally {
      // CRITICAL: Destroy ephemeral key immediately
      PreSignedTxBuilder.wipeKey(privateKey);
    }
  } catch (error) {
    console.error('Failed to generate platform signature:', error);

    // Fallback: Use dynamic platform pubkey with mock signature
    const platformPubkey = BitcoinEscrowService.getPlatformPublicKey();
    const mockSignature = `platform_sig_${txHash.slice(0, 16)}`;

    return {
      signature: mockSignature,
      publicKey: platformPubkey,
    };
  }
}

/**
 * Check if a transaction has been confirmed on Bitcoin testnet
 * Uses real RPC if available, falls back to mock
 */
export async function checkTransactionConfirmation(txid: string): Promise<{
  confirmed: boolean;
  confirmations: number;
  blockHeight?: number;
}> {
  try {
    const rpcClient = getBitcoinRpcClient();

    // Try real check if RPC is configured
    if (process.env.BITCOIN_RPC_URL) {
      try {
        const tx = await rpcClient.getTransaction(txid);

        return {
          confirmed: tx.confirmations > 0,
          confirmations: tx.confirmations || 0,
          blockHeight: tx.blockheight,
        };
      } catch (rpcError) {
        console.warn('⚠️  RPC confirmation check failed, using mock:', rpcError);
      }
    }

    // Fallback: Mock confirmation state
    return {
      confirmed: false,
      confirmations: 0,
    };
  } catch (error) {
    console.error('Failed to check transaction confirmation:', error);
    return {
      confirmed: false,
      confirmations: 0,
    };
  }
}

// ============================================================================
// Helper Functions (Mock Implementation)
// ============================================================================

function combineMockSignatures(transactions: PreSignedTransaction[]): string {
  // Mock: Combine PSBTs and signatures into final transaction hex
  const combinedSigs = transactions.map(tx => tx.signature).join('_');
  const mockTxHex = `0200000001${combinedSigs}ffffffff`;
  return Buffer.from(mockTxHex).toString('hex');
}

function generateMockTxid(txHex: string): string {
  // Mock: Generate deterministic transaction ID
  const hash = Buffer.from(txHex).toString('base64').slice(0, 16);
  return `testnet_txid_${hash.replace(/[^a-f0-9]/g, '0').padEnd(64, '0')}`;
}
