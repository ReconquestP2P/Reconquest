/**
 * Real PSBT Builder for Testnet4
 * Creates proper P2WSH multisig PSBTs that can be broadcast
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

bitcoin.initEccLib(ecc);

const TESTNET4: bitcoin.Network = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'tb',
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

export interface UTXOData {
  txid: string;
  vout: number;
  value: number;
}

export interface PSBTTemplateResult {
  psbtBase64: string;
  psbtHex: string;
  txHash: string;
  inputValue: number;
  outputValue: number;
  fee: number;
  // Canonical metadata for security validation
  canonicalTxid: string;
  inputTxid: string;
  inputVout: number;
  witnessScriptHash: string;
  outputAddress: string;
  feeRate: number;
  virtualSize: number;
}

// Estimated vsize for 2-of-3 P2WSH multisig with 1 input and 1 output
const MULTISIG_VSIZE = 180;

/**
 * Estimate fee from mempool.space API
 * Returns both the fee rate and calculated fee
 */
async function estimateFee(): Promise<{ feeRate: number; fee: number; vsize: number }> {
  const vsize = MULTISIG_VSIZE;
  try {
    const response = await fetch('https://mempool.space/testnet4/api/v1/fees/recommended');
    if (response.ok) {
      const fees = await response.json();
      const feeRate = fees.halfHourFee || 2;
      const fee = Math.ceil(feeRate * vsize);
      return { feeRate, fee, vsize };
    }
  } catch (error) {
    console.warn('Fee estimation failed, using default:', error);
  }
  // Default: 2 sat/vbyte
  return { feeRate: 2, fee: Math.ceil(2 * vsize), vsize };
}

/**
 * Create a PSBT template for spending from 2-of-3 multisig
 * Returns unsigned PSBT for frontend to sign
 */
export async function createSpendPSBT(
  utxo: UTXOData,
  witnessScriptHex: string,
  outputAddress: string,
  outputValue?: number
): Promise<PSBTTemplateResult> {
  console.log('🔨 Creating real PSBT template...');
  console.log(`   UTXO: ${utxo.txid}:${utxo.vout} (${utxo.value} sats)`);
  console.log(`   Output: ${outputAddress}`);
  
  const witnessScript = Buffer.from(witnessScriptHex, 'hex');
  
  const p2wsh = bitcoin.payments.p2wsh({
    redeem: { output: witnessScript, network: TESTNET4 },
    network: TESTNET4,
  });
  
  if (!p2wsh.output) {
    throw new Error('Failed to generate P2WSH output script');
  }
  
  const feeEstimate = await estimateFee();
  const actualOutputValue = outputValue || (utxo.value - feeEstimate.fee);
  
  if (actualOutputValue <= 0) {
    throw new Error(`Output value (${actualOutputValue}) must be positive`);
  }
  
  const psbt = new bitcoin.Psbt({ network: TESTNET4 });
  
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: p2wsh.output,
      value: BigInt(utxo.value),
    },
    witnessScript: witnessScript,
  });
  
  psbt.addOutput({
    address: outputAddress,
    value: BigInt(actualOutputValue),
  });
  
  const psbtBase64 = psbt.toBase64();
  const psbtHex = psbt.toHex();
  
  // Derive canonical txid from the PSBT's unsigned transaction
  let canonicalTxid: string;
  try {
    const unsignedTx = psbt.extractTransaction(true);
    canonicalTxid = unsignedTx.getId();
  } catch {
    // Fallback for incomplete PSBTs
    canonicalTxid = Buffer.from(psbt.data.globalMap.unsignedTx.toBuffer()).toString('hex').slice(0, 64);
  }
  
  // Compute witness script hash for verification
  const crypto = await import('crypto');
  const witnessScriptHash = crypto.createHash('sha256').update(witnessScript).digest('hex');
  
  console.log(`✅ PSBT template created`);
  console.log(`   Canonical txid: ${canonicalTxid.slice(0, 16)}...`);
  console.log(`   Fee: ${feeEstimate.fee} sats (${feeEstimate.feeRate} sat/vb)`);
  console.log(`   Output: ${actualOutputValue} sats → ${outputAddress.slice(0, 20)}...`);
  
  return {
    psbtBase64,
    psbtHex,
    txHash: canonicalTxid,
    inputValue: utxo.value,
    outputValue: actualOutputValue,
    fee: feeEstimate.fee,
    // Canonical metadata for security validation
    canonicalTxid,
    inputTxid: utxo.txid,
    inputVout: utxo.vout,
    witnessScriptHash,
    outputAddress,
    feeRate: feeEstimate.feeRate,
    virtualSize: feeEstimate.vsize,
  };
}

/**
 * Sign a PSBT with a private key
 */
export function signPSBT(
  psbtBase64: string,
  privateKeyHex: string
): { signedPsbtBase64: string; signature: string; publicKey: string } {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: TESTNET4 });
  const privateKey = Buffer.from(privateKeyHex, 'hex');
  const publicKey = Buffer.from(ecc.pointFromScalar(privateKey)!);
  
  const keyPair = {
    publicKey,
    sign: (hash: Buffer) => {
      const sig = ecc.sign(hash, privateKey);
      return Buffer.from(sig);
    },
  };
  
  psbt.signInput(0, keyPair);
  
  const partialSig = psbt.data.inputs[0].partialSig?.[0];
  const signature = partialSig ? Buffer.from(partialSig.signature).toString('hex') : '';
  
  return {
    signedPsbtBase64: psbt.toBase64(),
    signature,
    publicKey: publicKey.toString('hex'),
  };
}

/**
 * Combine multiple signed PSBTs and finalize
 */
export function combinePSBTs(signedPsbtBase64List: string[]): {
  finalTxHex: string;
  txid: string;
} {
  console.log(`🔗 Combining ${signedPsbtBase64List.length} signed PSBTs...`);
  
  if (signedPsbtBase64List.length < 2) {
    throw new Error('Need at least 2 signatures for 2-of-3 multisig');
  }
  
  const basePsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64List[0], { network: TESTNET4 });
  
  for (let i = 1; i < signedPsbtBase64List.length; i++) {
    const otherPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64List[i], { network: TESTNET4 });
    basePsbt.combine(otherPsbt);
  }
  
  basePsbt.finalizeAllInputs();
  const finalTx = basePsbt.extractTransaction();
  
  const txid = finalTx.getId();
  const finalTxHex = finalTx.toHex();
  
  console.log(`✅ Transaction finalized: ${txid}`);
  console.log(`   Tx hex length: ${finalTxHex.length}`);
  
  return { finalTxHex, txid };
}

/**
 * Fetch UTXO from mempool.space testnet4
 */
export async function fetchEscrowUTXO(address: string): Promise<UTXOData | null> {
  console.log(`📡 Fetching UTXOs for escrow address: ${address}`);
  
  try {
    const response = await fetch(`https://mempool.space/testnet4/api/address/${address}/utxo`);
    
    if (!response.ok) {
      console.error(`Failed to fetch UTXOs: ${response.status}`);
      return null;
    }
    
    const utxos = await response.json();
    
    if (!utxos || utxos.length === 0) {
      console.log('   No UTXOs found');
      return null;
    }
    
    const largestUtxo = utxos.reduce((max: any, utxo: any) =>
      utxo.value > max.value ? utxo : max
    );
    
    console.log(`   Found UTXO: ${largestUtxo.txid}:${largestUtxo.vout} (${largestUtxo.value} sats)`);
    
    return {
      txid: largestUtxo.txid,
      vout: largestUtxo.vout,
      value: largestUtxo.value,
    };
  } catch (error) {
    console.error('Error fetching UTXOs:', error);
    return null;
  }
}

/**
 * Validate testnet4 address
 */
export function isValidAddress(address: string): boolean {
  try {
    bitcoin.address.toOutputScript(address, TESTNET4);
    return true;
  } catch {
    return false;
  }
}
