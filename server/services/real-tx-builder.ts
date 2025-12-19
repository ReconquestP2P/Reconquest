/**
 * Real Bitcoin Transaction Builder for Testnet4
 * Uses bitcoinjs-lib to create actual broadcastable transactions
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { createHash } from 'crypto';

bitcoin.initEccLib(ecc);

const TESTNET4 = {
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
  
  const psbt = new bitcoin.Psbt({ network: TESTNET4 });
  
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: bitcoin.payments.p2wsh({ 
        redeem: { output: witnessScript, network: TESTNET4 },
        network: TESTNET4 
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
  
  const basePsbt = bitcoin.Psbt.fromBase64(psbtBase64List[0], { network: TESTNET4 });
  
  for (let i = 1; i < psbtBase64List.length; i++) {
    const otherPsbt = bitcoin.Psbt.fromBase64(psbtBase64List[i], { network: TESTNET4 });
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
 * Fetch UTXO info from mempool.space testnet4
 */
export async function fetchUTXO(address: string): Promise<UTXOInfo | null> {
  console.log(`📡 Fetching UTXOs for ${address}...`);
  
  try {
    const response = await fetch(`https://mempool.space/testnet4/api/address/${address}/utxo`);
    
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
 * Validate a testnet4 address
 */
export function isValidTestnet4Address(address: string): boolean {
  try {
    bitcoin.address.toOutputScript(address, TESTNET4);
    return true;
  } catch {
    return false;
  }
}
