/**
 * PSBT Creator Service
 * Creates real Bitcoin PSBTs for pre-signed transaction templates
 * 
 * Used to generate PSBTs that borrowers sign during the signing ceremony.
 * These pre-signed transactions limit what the platform can do with escrow funds.
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { getNetworkParams } from './bitcoin-network-selector.js';
import crypto from 'crypto';

bitcoin.initEccLib(ecc);

export interface PsbtTemplate {
  psbtBase64: string;
  txHash: string;
  outputs: {
    address: string;
    amount: number;
    purpose: 'borrower' | 'lender' | 'platform_fee';
  }[];
  escrowUtxo: {
    txid: string;
    vout: number;
    amount: number;
  };
  timelockBlocks?: number;
  validAfterTimestamp?: number;
}

export interface CreatePsbtParams {
  escrowAddress: string;
  witnessScriptHex: string;
  escrowUtxo: {
    txid: string;
    vout: number;
    amount: number;
  };
  destinationAddress: string;
  amount: number;
  timelockBlocks?: number;
}

function getNetwork(): bitcoin.Network {
  const params = getNetworkParams();
  return {
    messagePrefix: params.messagePrefix,
    bech32: params.bech32,
    bip32: params.bip32,
    pubKeyHash: params.pubKeyHash,
    scriptHash: params.scriptHash,
    wif: params.wif,
  };
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
 * Build witness script with timelock for recovery transactions
 * Uses OP_CHECKSEQUENCEVERIFY for relative timelock
 */
function buildTimelockWitnessScript(pubkeys: string[], timelockBlocks: number): Buffer {
  const sortedPubkeys = [...pubkeys].sort();
  
  // Script: <blocks> OP_CSV OP_DROP OP_2 <pk1> <pk2> <pk3> OP_3 OP_CHECKMULTISIG
  const script: number[] = [];
  
  // Push timelock value
  if (timelockBlocks < 0x10) {
    script.push(0x50 + timelockBlocks); // OP_1 through OP_16
  } else {
    const timelockBytes = Buffer.alloc(4);
    timelockBytes.writeUInt32LE(timelockBlocks);
    let len = 4;
    while (len > 1 && timelockBytes[len - 1] === 0) len--;
    script.push(len);
    for (let i = 0; i < len; i++) {
      script.push(timelockBytes[i]);
    }
  }
  
  script.push(0xb2); // OP_CHECKSEQUENCEVERIFY
  script.push(0x75); // OP_DROP
  
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

export class PsbtCreatorService {
  /**
   * Create a REPAYMENT PSBT - returns collateral to borrower
   */
  static createRepaymentPsbt(params: {
    witnessScriptHex: string;
    escrowUtxo: { txid: string; vout: number; amount: number };
    borrowerAddress: string;
    feeRate?: number;
  }): PsbtTemplate {
    const { witnessScriptHex, escrowUtxo, borrowerAddress, feeRate = 1 } = params;
    
    const network = getNetwork();
    const witnessScript = Buffer.from(witnessScriptHex, 'hex');
    
    // Calculate fee (estimated 180 vbytes for 2-of-3 multisig)
    const estimatedVsize = 180;
    const fee = estimatedVsize * feeRate;
    const outputAmount = escrowUtxo.amount - fee;
    
    if (outputAmount <= 546) {
      throw new Error('Output amount too small after fees (dust limit)');
    }
    
    const psbt = new bitcoin.Psbt({ network });
    
    psbt.addInput({
      hash: escrowUtxo.txid,
      index: escrowUtxo.vout,
      witnessUtxo: {
        script: bitcoin.payments.p2wsh({
          redeem: { output: witnessScript, network },
          network,
        }).output!,
        value: BigInt(escrowUtxo.amount),
      },
      witnessScript: witnessScript,
    });
    
    psbt.addOutput({
      address: borrowerAddress,
      value: BigInt(outputAmount),
    });
    
    const psbtBase64 = psbt.toBase64();
    const txHash = crypto.createHash('sha256').update(psbtBase64).digest('hex').slice(0, 64);
    
    return {
      psbtBase64,
      txHash,
      outputs: [{
        address: borrowerAddress,
        amount: outputAmount,
        purpose: 'borrower'
      }],
      escrowUtxo
    };
  }
  
  /**
   * Create a DEFAULT_LIQUIDATION PSBT - sends to lender (with remainder to borrower)
   */
  static createDefaultLiquidationPsbt(params: {
    witnessScriptHex: string;
    escrowUtxo: { txid: string; vout: number; amount: number };
    lenderAddress: string;
    borrowerAddress: string;
    amountOwedSats: number;
    feeRate?: number;
  }): PsbtTemplate {
    const { witnessScriptHex, escrowUtxo, lenderAddress, borrowerAddress, amountOwedSats, feeRate = 1 } = params;
    
    const network = getNetwork();
    const witnessScript = Buffer.from(witnessScriptHex, 'hex');
    
    // Calculate fee
    const estimatedVsize = 220; // slightly larger with 2 outputs
    const fee = estimatedVsize * feeRate;
    
    // Lender gets what they're owed, borrower gets remainder
    const lenderAmount = Math.min(amountOwedSats, escrowUtxo.amount - fee - 546);
    const borrowerRemainder = escrowUtxo.amount - lenderAmount - fee;
    
    if (lenderAmount <= 546) {
      throw new Error('Lender amount too small (dust limit)');
    }
    
    const psbt = new bitcoin.Psbt({ network });
    
    psbt.addInput({
      hash: escrowUtxo.txid,
      index: escrowUtxo.vout,
      witnessUtxo: {
        script: bitcoin.payments.p2wsh({
          redeem: { output: witnessScript, network },
          network,
        }).output!,
        value: BigInt(escrowUtxo.amount),
      },
      witnessScript: witnessScript,
    });
    
    const outputs: PsbtTemplate['outputs'] = [];
    
    // Lender gets owed amount
    psbt.addOutput({
      address: lenderAddress,
      value: BigInt(lenderAmount),
    });
    outputs.push({
      address: lenderAddress,
      amount: lenderAmount,
      purpose: 'lender'
    });
    
    // Borrower gets remainder if above dust
    if (borrowerRemainder > 546) {
      psbt.addOutput({
        address: borrowerAddress,
        value: BigInt(borrowerRemainder),
      });
      outputs.push({
        address: borrowerAddress,
        amount: borrowerRemainder,
        purpose: 'borrower'
      });
    }
    
    const psbtBase64 = psbt.toBase64();
    const txHash = crypto.createHash('sha256').update(psbtBase64).digest('hex').slice(0, 64);
    
    return {
      psbtBase64,
      txHash,
      outputs,
      escrowUtxo
    };
  }
  
  /**
   * Create a BORROWER_RECOVERY PSBT - time-locked recovery to borrower
   * NOTE: This uses a separate witness script with CSV timelock
   */
  static createRecoveryPsbt(params: {
    pubkeys: string[];
    escrowUtxo: { txid: string; vout: number; amount: number };
    borrowerAddress: string;
    timelockBlocks: number;
    feeRate?: number;
  }): PsbtTemplate {
    const { pubkeys, escrowUtxo, borrowerAddress, timelockBlocks, feeRate = 1 } = params;
    
    const network = getNetwork();
    
    // Build time-locked witness script
    const timelockWitnessScript = buildTimelockWitnessScript(pubkeys, timelockBlocks);
    
    // Calculate fee
    const estimatedVsize = 200; // slightly larger due to timelock script
    const fee = estimatedVsize * feeRate;
    const outputAmount = escrowUtxo.amount - fee;
    
    if (outputAmount <= 546) {
      throw new Error('Output amount too small after fees (dust limit)');
    }
    
    const psbt = new bitcoin.Psbt({ network });
    
    psbt.addInput({
      hash: escrowUtxo.txid,
      index: escrowUtxo.vout,
      witnessUtxo: {
        script: bitcoin.payments.p2wsh({
          redeem: { output: timelockWitnessScript, network },
          network,
        }).output!,
        value: BigInt(escrowUtxo.amount),
      },
      witnessScript: timelockWitnessScript,
      sequence: timelockBlocks, // Set sequence for CSV
    });
    
    psbt.addOutput({
      address: borrowerAddress,
      value: BigInt(outputAmount),
    });
    
    const psbtBase64 = psbt.toBase64();
    const txHash = crypto.createHash('sha256').update(psbtBase64).digest('hex').slice(0, 64);
    
    // Calculate valid-after timestamp
    const validAfterTimestamp = Date.now() + (timelockBlocks * 10 * 60 * 1000); // ~10 min per block
    
    return {
      psbtBase64,
      txHash,
      outputs: [{
        address: borrowerAddress,
        amount: outputAmount,
        purpose: 'borrower'
      }],
      escrowUtxo,
      timelockBlocks,
      validAfterTimestamp
    };
  }
  
  /**
   * Sign a PSBT with a private key (for platform signing)
   */
  static signPsbt(psbtBase64: string, privateKeyHex: string, inputIndex: number = 0): string {
    const network = getNetwork();
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
    
    const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');
    const keyPair = {
      publicKey: Buffer.from(ecc.pointFromScalar(privateKeyBuffer, true)!),
      privateKey: privateKeyBuffer,
      sign: (hash: Buffer) => Buffer.from(ecc.sign(hash, privateKeyBuffer)),
    };
    
    psbt.signInput(inputIndex, keyPair);
    
    return psbt.toBase64();
  }
  
  /**
   * SECURITY: Cryptographically verify a PSBT signature from expected pubkey
   * Uses bitcoinjs-lib's validateSignaturesOfInput for proper sighash verification
   */
  static verifySignature(psbtBase64: string, pubkeyHex: string, inputIndex: number = 0): boolean {
    try {
      const network = getNetwork();
      const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
      
      const input = psbt.data.inputs[inputIndex];
      if (!input.partialSig || input.partialSig.length === 0) {
        console.log('[PsbtCreator] No signatures found in PSBT');
        return false;
      }
      
      // Check if expected pubkey is in signatures
      const expectedPubkey = Buffer.from(pubkeyHex, 'hex');
      const hasPubkey = input.partialSig.some(sig => sig.pubkey.equals(expectedPubkey));
      if (!hasPubkey) {
        console.log('[PsbtCreator] Expected pubkey not found in signatures');
        return false;
      }
      
      // Cryptographically verify signatures using bitcoinjs-lib
      // This validates the signature against the sighash
      try {
        const validator = (pubkey: Buffer, msghash: Buffer, signature: Buffer): boolean => {
          return ecc.verify(msghash, pubkey, signature);
        };
        
        const isValid = psbt.validateSignaturesOfInput(inputIndex, validator, expectedPubkey);
        if (!isValid) {
          console.log('[PsbtCreator] Cryptographic signature verification failed');
          return false;
        }
        return true;
      } catch (validationError: any) {
        // validateSignaturesOfInput may throw if signature invalid
        console.log('[PsbtCreator] Signature validation error:', validationError.message);
        return false;
      }
    } catch (e: any) {
      console.error('[PsbtCreator] Error verifying signature:', e.message);
      return false;
    }
  }
  
  /**
   * Finalize and extract a fully signed transaction
   */
  static finalizeAndExtract(psbtBase64: string): { txHex: string; txid: string } {
    const network = getNetwork();
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
    
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();
    
    return {
      txHex: tx.toHex(),
      txid: tx.getId()
    };
  }
  
  /**
   * Count signatures on a PSBT input
   */
  static countSignatures(psbtBase64: string, inputIndex: number = 0): number {
    try {
      const network = getNetwork();
      const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
      
      const input = psbt.data.inputs[inputIndex];
      return input.partialSig?.length || 0;
    } catch {
      return 0;
    }
  }

  /**
   * SECURITY: Verify PSBT input witness script matches the expected escrow script
   * This prevents attackers from submitting PSBTs that spend from different UTXOs
   */
  static verifyPsbtWitnessScript(psbtBase64: string, expectedWitnessScriptHex: string, inputIndex: number = 0): boolean {
    try {
      const network = getNetwork();
      const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
      
      const input = psbt.data.inputs[inputIndex];
      if (!input.witnessScript) {
        console.error('[PsbtCreator] PSBT missing witnessScript');
        return false;
      }
      
      const psbtWitnessHex = input.witnessScript.toString('hex');
      const expectedHex = expectedWitnessScriptHex.toLowerCase();
      
      if (psbtWitnessHex.toLowerCase() !== expectedHex) {
        console.error(`[PsbtCreator] Witness script mismatch: expected ${expectedHex.slice(0, 40)}..., got ${psbtWitnessHex.slice(0, 40)}...`);
        return false;
      }
      
      return true;
    } catch (e: any) {
      console.error('[PsbtCreator] Error verifying witness script:', e.message);
      return false;
    }
  }

  /**
   * SECURITY: Verify PSBT input matches expected escrow UTXO (txid:vout)
   */
  static verifyPsbtUtxo(psbtBase64: string, expectedTxid: string, expectedVout: number, inputIndex: number = 0): boolean {
    try {
      const network = getNetwork();
      const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
      
      const txInput = psbt.txInputs[inputIndex];
      const inputTxid = txInput.hash.reverse().toString('hex');
      const inputVout = txInput.index;
      
      return inputTxid === expectedTxid && inputVout === expectedVout;
    } catch {
      return false;
    }
  }
}
