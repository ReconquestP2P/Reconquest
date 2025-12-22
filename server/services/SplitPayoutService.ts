/**
 * Split Payout Service
 * 
 * Handles fair distribution of collateral in dispute resolution.
 * Calculates how much goes to lender (principal + interest) and borrower (remainder).
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { getBtcPrice } from './price-service.js';
import { broadcastTransaction } from './bitcoin-broadcast.js';
import { BitcoinEscrowService } from './BitcoinEscrowService.js';
import type { Loan } from '@shared/schema';

bitcoin.initEccLib(ecc);

const TESTNET4_NETWORK = bitcoin.networks.testnet;
const DUST_THRESHOLD = 546; // Minimum output in satoshis
const DEFAULT_FEE_RATE = 5; // sats/vbyte fallback

export interface SplitCalculation {
  totalCollateralSats: number;
  lenderPayoutSats: number;
  borrowerPayoutSats: number;
  networkFeeSats: number;
  btcPriceEur: number;
  btcPriceUsd: number;
  debtEur: number; // principal + interest
  collateralValueEur: number;
  isUnderwaterLoan: boolean; // collateral < debt
  lenderReceivesFullCollateral: boolean;
  priceTimestamp: string;
}

export interface SplitPayoutResult {
  success: boolean;
  txid?: string;
  error?: string;
  calculation: SplitCalculation;
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
 * Calculate fair split between lender and borrower
 */
export async function calculateSplit(loan: Loan): Promise<SplitCalculation> {
  // Get current BTC price
  const priceData = await getBtcPrice();
  const btcPriceEur = priceData.eur;
  const btcPriceUsd = priceData.usd;
  
  // Get total collateral in satoshis
  const collateralBtc = parseFloat(loan.collateralBtc || '0');
  const totalCollateralSats = Math.floor(collateralBtc * 100_000_000);
  
  // Calculate debt: principal + interest (loan values are in EUR)
  const principalEur = parseFloat(loan.amount);
  const interestRate = parseFloat(loan.interestRate || '0');
  const termMonths = parseInt(loan.termMonths?.toString() || '3');
  const interestEur = principalEur * (interestRate / 100) * (termMonths / 12);
  const debtEur = principalEur + interestEur;
  
  // Calculate collateral value in EUR
  const collateralValueEur = collateralBtc * btcPriceEur;
  
  // Calculate network fee (estimate: 200 vbytes for 2-of-3 multisig with 2 outputs)
  const estimatedVbytes = 200;
  const networkFeeSats = estimatedVbytes * DEFAULT_FEE_RATE;
  
  // Convert debt to satoshis at current price
  // debtEur / btcPriceEur = BTC amount
  // BTC amount * 100_000_000 = satoshis
  const lenderPayoutBtc = debtEur / btcPriceEur;
  let lenderPayoutSats = Math.floor(lenderPayoutBtc * 100_000_000);
  
  // Handle edge case: collateral cannot even cover network fees
  if (totalCollateralSats <= networkFeeSats) {
    return {
      totalCollateralSats,
      lenderPayoutSats: Math.max(0, totalCollateralSats - 100), // Minimal fee
      borrowerPayoutSats: 0,
      networkFeeSats: Math.min(networkFeeSats, 100),
      btcPriceEur,
      btcPriceUsd,
      debtEur,
      collateralValueEur,
      isUnderwaterLoan: true,
      lenderReceivesFullCollateral: true,
      priceTimestamp: new Date().toISOString(),
    };
  }
  
  // Check if underwater (collateral less than debt + fees)
  const isUnderwaterLoan = totalCollateralSats < (lenderPayoutSats + networkFeeSats);
  let lenderReceivesFullCollateral = isUnderwaterLoan;
  let borrowerPayoutSats = 0;
  
  if (isUnderwaterLoan) {
    // Lender gets everything minus fees
    lenderPayoutSats = Math.max(0, totalCollateralSats - networkFeeSats);
    borrowerPayoutSats = 0;
    lenderReceivesFullCollateral = true;
  } else {
    // Fair split: lender gets debt, borrower gets remainder minus fees
    borrowerPayoutSats = totalCollateralSats - lenderPayoutSats - networkFeeSats;
    
    // If borrower remainder is below dust threshold, give it to lender
    if (borrowerPayoutSats < DUST_THRESHOLD) {
      lenderPayoutSats = Math.max(0, totalCollateralSats - networkFeeSats);
      borrowerPayoutSats = 0;
      lenderReceivesFullCollateral = true;
    }
  }
  
  // Ensure all payouts are non-negative and at least dust threshold if > 0
  lenderPayoutSats = Math.max(0, lenderPayoutSats);
  borrowerPayoutSats = Math.max(0, borrowerPayoutSats);
  
  // If lender payout is below dust but > 0, either bump to dust or set to 0
  if (lenderPayoutSats > 0 && lenderPayoutSats < DUST_THRESHOLD) {
    if (totalCollateralSats >= DUST_THRESHOLD + networkFeeSats) {
      lenderPayoutSats = DUST_THRESHOLD;
      borrowerPayoutSats = Math.max(0, totalCollateralSats - lenderPayoutSats - networkFeeSats);
    } else {
      // Not enough for dust, give everything to lender minus fees
      lenderPayoutSats = Math.max(0, totalCollateralSats - networkFeeSats);
      borrowerPayoutSats = 0;
    }
  }
  
  return {
    totalCollateralSats,
    lenderPayoutSats,
    borrowerPayoutSats,
    networkFeeSats,
    btcPriceEur,
    btcPriceUsd,
    debtEur,
    collateralValueEur,
    isUnderwaterLoan,
    lenderReceivesFullCollateral,
    priceTimestamp: new Date().toISOString(),
  };
}

/**
 * Build and broadcast a split payout transaction
 */
export async function executeSplitPayout(
  loan: Loan,
  lenderAddress: string,
  borrowerAddress: string,
  platformPrivateKeyHex: string
): Promise<SplitPayoutResult> {
  console.log(`💰 Starting split payout for loan #${loan.id}`);
  
  // Calculate the split
  const calculation = await calculateSplit(loan);
  
  console.log(`📊 Split calculation:
    - Total collateral: ${calculation.totalCollateralSats} sats
    - Lender payout: ${calculation.lenderPayoutSats} sats (debt: €${calculation.debtEur.toFixed(2)})
    - Borrower payout: ${calculation.borrowerPayoutSats} sats
    - Network fee: ${calculation.networkFeeSats} sats
    - BTC price: €${calculation.btcPriceEur.toFixed(2)}
    - Underwater: ${calculation.isUnderwaterLoan}`);
  
  try {
    // Fetch UTXOs from escrow address
    if (!loan.escrowAddress) {
      return { 
        success: false, 
        error: 'No escrow address found',
        calculation 
      };
    }
    
    const utxos = await fetchUTXOs(loan.escrowAddress);
    if (utxos.length === 0) {
      return { 
        success: false, 
        error: 'No UTXOs found in escrow',
        calculation 
      };
    }
    
    // Get public keys for witness script
    if (!loan.borrowerPubkey || !loan.lenderPubkey || !loan.platformPubkey) {
      return { 
        success: false, 
        error: 'Missing public keys for multisig',
        calculation 
      };
    }
    
    const pubkeys = [loan.borrowerPubkey, loan.lenderPubkey, loan.platformPubkey];
    const witnessScript = buildWitnessScript(pubkeys);
    
    // Create PSBT
    const psbt = new bitcoin.Psbt({ network: TESTNET4_NETWORK });
    
    // Add all UTXOs as inputs
    let totalInputSats = 0;
    for (const utxo of utxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: bitcoin.payments.p2wsh({
            redeem: { output: witnessScript },
            network: TESTNET4_NETWORK,
          }).output!,
          value: BigInt(utxo.value),
        },
        witnessScript: witnessScript,
      });
      totalInputSats += utxo.value;
    }
    
    console.log(`📥 Added ${utxos.length} UTXOs totaling ${totalInputSats} sats`);
    
    // Recalculate with actual UTXO total
    const actualFeeSats = calculation.networkFeeSats;
    let actualLenderSats = calculation.lenderPayoutSats;
    let actualBorrowerSats = calculation.borrowerPayoutSats;
    
    // Adjust if actual UTXO total differs from loan.collateralBtc
    if (totalInputSats !== calculation.totalCollateralSats) {
      console.log(`⚠️ UTXO total (${totalInputSats}) differs from recorded collateral (${calculation.totalCollateralSats})`);
      
      // Recalculate based on actual UTXOs
      if (totalInputSats < actualLenderSats + actualFeeSats) {
        // Underwater based on actual UTXOs
        actualLenderSats = totalInputSats - actualFeeSats;
        actualBorrowerSats = 0;
      } else {
        actualBorrowerSats = totalInputSats - actualLenderSats - actualFeeSats;
        if (actualBorrowerSats < DUST_THRESHOLD) {
          actualLenderSats = totalInputSats - actualFeeSats;
          actualBorrowerSats = 0;
        }
      }
    }
    
    // Add outputs
    // Output 1: Lender payout
    psbt.addOutput({
      address: lenderAddress,
      value: BigInt(actualLenderSats),
    });
    console.log(`📤 Output 1: ${actualLenderSats} sats to lender (${lenderAddress.substring(0, 20)}...)`);
    
    // Output 2: Borrower payout (if any)
    if (actualBorrowerSats >= DUST_THRESHOLD) {
      psbt.addOutput({
        address: borrowerAddress,
        value: BigInt(actualBorrowerSats),
      });
      console.log(`📤 Output 2: ${actualBorrowerSats} sats to borrower (${borrowerAddress.substring(0, 20)}...)`);
    }
    
    // Sign ALL inputs with platform key
    console.log(`🔑 Signing ${utxos.length} input(s) with platform key...`);
    for (let i = 0; i < utxos.length; i++) {
      signPsbtInput(psbt, i, platformPrivateKeyHex, witnessScript);
    }
    console.log(`✍️ Signed with platform key`);
    
    // On testnet, platform has authority to finalize transactions for dispute resolution
    // In production, this would use pre-signed recovery transactions from both parties
    console.log(`🔑 Platform dispute resolution authority - finalizing...`);
    
    // Finalize and extract
    // Note: For testnet dispute resolution, platform has authority to finalize
    // In production, this would require combining pre-signed transactions from both parties
    try {
      psbt.finalizeAllInputs();
      console.log(`✅ Transaction finalized successfully`);
    } catch (err: any) {
      console.log(`⚠️ Failed to finalize transaction: ${err.message}`);
      
      // Return detailed error for debugging
      return {
        success: false,
        error: `Transaction requires 2-of-3 multisig signatures. Platform signed once but finalization failed: ${err.message}. In production, use pre-signed recovery transactions.`,
        calculation: {
          ...calculation,
          lenderPayoutSats: actualLenderSats,
          borrowerPayoutSats: actualBorrowerSats,
          totalCollateralSats: totalInputSats,
        },
      };
    }
    
    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();
    const txid = tx.getId();
    
    console.log(`📝 Transaction built: ${txid}`);
    
    // Broadcast
    const broadcastResult = await broadcastTransaction(txHex);
    
    if (!broadcastResult.success) {
      return {
        success: false,
        error: broadcastResult.error || 'Broadcast failed',
        calculation: {
          ...calculation,
          lenderPayoutSats: actualLenderSats,
          borrowerPayoutSats: actualBorrowerSats,
          totalCollateralSats: totalInputSats,
        },
      };
    }
    
    console.log(`✅ Split payout broadcast successful: ${broadcastResult.txid}`);
    
    return {
      success: true,
      txid: broadcastResult.txid,
      calculation: {
        ...calculation,
        lenderPayoutSats: actualLenderSats,
        borrowerPayoutSats: actualBorrowerSats,
        totalCollateralSats: totalInputSats,
      },
      broadcastUrl: `https://mempool.space/testnet4/tx/${broadcastResult.txid}`,
    };
    
  } catch (error: any) {
    console.error('Split payout error:', error);
    return {
      success: false,
      error: error.message || 'Split payout failed',
      calculation,
    };
  }
}

/**
 * Preview split calculation without executing
 */
export async function previewSplit(loan: Loan): Promise<{
  calculation: SplitCalculation;
  summary: string;
}> {
  const calculation = await calculateSplit(loan);
  
  const lenderBtc = calculation.lenderPayoutSats / 100_000_000;
  const borrowerBtc = calculation.borrowerPayoutSats / 100_000_000;
  const lenderEur = lenderBtc * calculation.btcPriceEur;
  const borrowerEur = borrowerBtc * calculation.btcPriceEur;
  
  let summary = `Fair Split Preview:\n`;
  summary += `• Debt owed: €${calculation.debtEur.toFixed(2)}\n`;
  summary += `• Collateral value: €${calculation.collateralValueEur.toFixed(2)}\n`;
  summary += `• BTC price: €${calculation.btcPriceEur.toFixed(2)}\n\n`;
  
  if (calculation.lenderReceivesFullCollateral) {
    summary += `⚠️ ${calculation.isUnderwaterLoan ? 'Underwater loan' : 'Borrower remainder below dust'}: Lender receives full collateral\n`;
  }
  
  summary += `Lender receives: ${lenderBtc.toFixed(8)} BTC (€${lenderEur.toFixed(2)})\n`;
  summary += `Borrower receives: ${borrowerBtc.toFixed(8)} BTC (€${borrowerEur.toFixed(2)})\n`;
  summary += `Network fee: ${calculation.networkFeeSats} sats`;
  
  return { calculation, summary };
}
