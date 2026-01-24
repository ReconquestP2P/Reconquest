/**
 * Real Bitcoin Transaction Builder
 * Uses bitcoinjs-lib to create actual broadcastable transactions
 * Supports both testnet4 and mainnet via network selector
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { createHash } from 'crypto';
import { getUtxoUrl, getNetworkParams } from './bitcoin-network-selector.js';

bitcoin.initEccLib(ecc);

// Get network params dynamically from network selector
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

export interface UTXOInfo {
  txid: string;
  vout: number;
  value: number;
  witnessScript: string;
}

export interface TransactionOutput {
  address: string;
  value: number;
}

export interface SignedTransactionData {
  psbtBase64: string;
  txHex: string;
  txHash: string;
  signature: string;
  publicKey: string;
}

/**
 * Create a real Bitcoin transaction spending from a 2-of-3 multisig
 */
export async function createMultisigSpendTransaction(
  utxo: UTXOInfo,
  outputs: TransactionOutput[],
  privateKeyHex: string,
  publicKeyHex: string
): Promise<SignedTransactionData> {
  console.log('🔨 Building real Bitcoin transaction...');
  console.log(`   UTXO: ${utxo.txid}:${utxo.vout} (${utxo.value} sats)`);
  
  const privateKey = Buffer.from(privateKeyHex, 'hex');
  const publicKey = Buffer.from(publicKeyHex, 'hex');
  const witnessScript = Buffer.from(utxo.witnessScript, 'hex');
  const network = getNetwork();
  
  const psbt = new bitcoin.Psbt({ network });
  
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: bitcoin.payments.p2wsh({ 
        redeem: { output: witnessScript, network },
        network 
      }).output!,
      value: BigInt(utxo.value),
    },
    witnessScript: witnessScript,
  });
  
  for (const output of outputs) {
    psbt.addOutput({
      address: output.address,
      value: BigInt(output.value),
    });
  }
  
  const keyPair = {
    publicKey,
    sign: (hash: Buffer) => {
      const sig = ecc.sign(hash, privateKey);
      return Buffer.from(sig);
    },
  };
  
  psbt.signInput(0, keyPair);
  
  const psbtBase64 = psbt.toBase64();
  const txHash = createHash('sha256').update(psbt.toBuffer()).digest('hex');
  
  const partialSig = psbt.data.inputs[0].partialSig?.[0];
  const signature = partialSig ? Buffer.from(partialSig.signature).toString('hex') : '';
  
  console.log(`✅ Transaction signed by ${publicKeyHex.slice(0, 16)}...`);
  
  return {
    psbtBase64,
    txHex: psbt.toHex(),
    txHash,
    signature,
    publicKey: publicKeyHex,
  };
}

/**
 * Combine multiple partial signatures into a final transaction
 */
export function combineMultisigSignatures(
  psbtBase64List: string[],
  witnessScript: string
): { finalTxHex: string; txid: string } {
  console.log(`🔗 Combining ${psbtBase64List.length} signatures...`);
  
  if (psbtBase64List.length < 2) {
    throw new Error('Need at least 2 signatures for 2-of-3 multisig');
  }
  
  const network = getNetwork();
  const basePsbt = bitcoin.Psbt.fromBase64(psbtBase64List[0], { network });
  
  for (let i = 1; i < psbtBase64List.length; i++) {
    const otherPsbt = bitcoin.Psbt.fromBase64(psbtBase64List[i], { network });
    basePsbt.combine(otherPsbt);
  }
  
  try {
    basePsbt.finalizeAllInputs();
    const finalTx = basePsbt.extractTransaction();
    const txid = finalTx.getId();
    const finalTxHex = finalTx.toHex();
    
    console.log(`✅ Transaction finalized: ${txid}`);
    return { finalTxHex, txid };
  } catch (error) {
    console.error('Failed to finalize transaction:', error);
    throw error;
  }
}

/**
 * Fetch UTXO info from mempool.space API
 */
export async function fetchUTXO(address: string): Promise<UTXOInfo | null> {
  console.log(`📡 Fetching UTXOs for ${address}...`);
  
  try {
    const response = await fetch(getUtxoUrl(address));
    
    if (!response.ok) {
      console.error(`Failed to fetch UTXOs: ${response.status}`);
      return null;
    }
    
    const utxos = await response.json();
    
    if (!utxos || utxos.length === 0) {
      console.log('No UTXOs found for address');
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
      witnessScript: '',
    };
  } catch (error) {
    console.error('Error fetching UTXOs:', error);
    return null;
  }
}

/**
 * Calculate transaction fee based on virtual size
 */
export function calculateFee(numInputs: number, numOutputs: number, feeRate: number = 2): number {
  const vsize = 10 + (68 * numInputs) + (34 * numOutputs) + 100;
  return vsize * feeRate;
}

/**
 * Validate a Bitcoin address for the current network
 */
export function isValidBitcoinAddress(address: string): boolean {
  try {
    bitcoin.address.toOutputScript(address, getNetwork());
    return true;
  } catch {
    return false;
  }
}

// Legacy alias for backward compatibility
export const isValidTestnet4Address = isValidBitcoinAddress;
