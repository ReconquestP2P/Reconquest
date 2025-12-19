/**
 * REAL Bitcoin Testnet Broadcast
 * Uses the funded escrow address to create and broadcast a real transaction
 * Uses tiny-secp256k1 (recommended for bitcoinjs-lib)
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { createHash } from 'crypto';
import axios from 'axios';

// Initialize bitcoinjs-lib with tiny-secp256k1
bitcoin.initEccLib(ecc);

const TESTNET = bitcoin.networks.testnet;

// DETERMINISTIC TEST KEYS (same as testnet-fundable-escrow.ts)
const TEST_SEEDS = {
  borrower: 'reconquest_testnet_borrower_seed_v1',
  lender: 'reconquest_testnet_lender_seed_v1', 
  platform: 'reconquest_testnet_platform_seed_v1',
};

function deriveTestKey(seed: string): Buffer {
  return createHash('sha256').update(seed).digest();
}

interface UTXO {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
  };
}

async function fetchUTXOs(address: string): Promise<UTXO[]> {
  console.log(`📡 Fetching UTXOs for ${address}...`);
  const response = await axios.get(
    `https://mempool.space/testnet4/api/address/${address}/utxo`,
    { timeout: 30000 }
  );
  return response.data;
}

async function broadcastTransaction(txHex: string): Promise<string> {
  console.log('📡 Broadcasting transaction via Mempool.space...');
  const response = await axios.post(
    'https://mempool.space/testnet4/api/tx',
    txHex,
    {
      headers: { 'Content-Type': 'text/plain' },
      timeout: 30000,
    }
  );
  return response.data;
}

// Create ECPair-like signer from private key
function createSigner(privateKey: Buffer) {
  const publicKey = Buffer.from(ecc.pointFromScalar(privateKey)!);
  
  return {
    publicKey,
    sign: (hash: Buffer): Buffer => {
      const sig = ecc.sign(hash, privateKey);
      return Buffer.from(sig);
    },
  };
}

async function runRealBroadcast() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║   REAL BITCOIN TESTNET BROADCAST - FUNDED ESCROW               ║');
  console.log('║   Using tiny-secp256k1 (bitcoinjs-lib recommended)             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Derive deterministic keys
  const borrowerPriv = deriveTestKey(TEST_SEEDS.borrower);
  const lenderPriv = deriveTestKey(TEST_SEEDS.lender);
  const platformPriv = deriveTestKey(TEST_SEEDS.platform);

  // Create signers using tiny-secp256k1
  const borrowerSigner = createSigner(borrowerPriv);
  const lenderSigner = createSigner(lenderPriv);
  const platformSigner = createSigner(platformPriv);

  // Create array of key objects for easier tracking
  const keyPairs = [
    { name: 'borrower', pub: borrowerSigner.publicKey, signer: borrowerSigner },
    { name: 'lender', pub: lenderSigner.publicKey, signer: lenderSigner },
    { name: 'platform', pub: platformSigner.publicKey, signer: platformSigner },
  ];

  // Sort by pubkey (BIP-67)
  keyPairs.sort((a, b) => a.pub.compare(b.pub));
  const pubkeys = keyPairs.map(k => k.pub);

  console.log('🔑 Sorted pubkey order:');
  keyPairs.forEach((k, i) => console.log(`   [${i}] ${k.name}: ${k.pub.toString('hex').slice(0, 20)}...`));

  // Create multisig payment
  const p2ms = bitcoin.payments.p2ms({
    m: 2,
    pubkeys,
    network: TESTNET,
  });

  const p2wsh = bitcoin.payments.p2wsh({
    redeem: p2ms,
    network: TESTNET,
  });

  const escrowAddress = p2wsh.address!;
  console.log(`\n🏦 Escrow Address: ${escrowAddress}`);

  // Fetch UTXOs
  const utxos = await fetchUTXOs(escrowAddress);
  
  if (utxos.length === 0) {
    console.log('❌ No UTXOs found for escrow address');
    return;
  }

  console.log(`✅ Found ${utxos.length} UTXO(s):`);
  utxos.forEach((utxo, i) => {
    console.log(`   [${i}] ${utxo.txid}:${utxo.vout} - ${utxo.value} sats (${utxo.status.confirmed ? 'confirmed' : 'unconfirmed'})`);
  });

  // Use the first UTXO
  const utxo = utxos[0];
  const inputValue = utxo.value;

  // Calculate fee (use 2 sat/vbyte for testnet)
  const estimatedVsize = 150;
  const feeRate = 2;
  const fee = estimatedVsize * feeRate;

  // Create a simple P2WPKH address for the borrower to receive funds
  const borrowerP2wpkh = bitcoin.payments.p2wpkh({
    pubkey: borrowerSigner.publicKey,
    network: TESTNET,
  });
  
  const outputValue = inputValue - fee;
  
  console.log(`\n📊 Transaction Details:`);
  console.log(`   Input:  ${inputValue} sats`);
  console.log(`   Fee:    ${fee} sats (${feeRate} sat/vB)`);
  console.log(`   Output: ${outputValue} sats → ${borrowerP2wpkh.address}`);

  if (outputValue <= 0) {
    console.log('❌ Output value too low after fees');
    return;
  }

  // Build the transaction
  console.log('\n🔨 Building transaction...');
  
  const psbt = new bitcoin.Psbt({ network: TESTNET });

  // Add input
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: p2wsh.output!,
      value: BigInt(inputValue),
    },
    witnessScript: p2ms.output!,
  });

  // Add output
  psbt.addOutput({
    address: borrowerP2wpkh.address!,
    value: BigInt(outputValue),
  });

  console.log('✅ PSBT created');

  // Sign with first 2 keys in sorted order (2-of-3 multisig)
  console.log('\n🔐 Signing with first 2 keys in sorted order...');
  
  for (let i = 0; i < 2; i++) {
    const keyPair = keyPairs[i];
    console.log(`🔐 Signing with ${keyPair.name} key (sorted position ${i})...`);
    psbt.signInput(0, keyPair.signer);
    console.log(`✅ ${keyPair.name} signature added`);
  }

  // Debug: Print PSBT state before finalize
  console.log('\n📊 PSBT Debug Info:');
  const psbtData = psbt.data.inputs[0];
  console.log(`   Partial sigs count: ${psbtData.partialSig?.length || 0}`);
  if (psbtData.partialSig) {
    psbtData.partialSig.forEach((ps, i) => {
      console.log(`   [${i}] Pubkey: ${ps.pubkey.toString('hex').slice(0, 20)}...`);
      console.log(`       Sig len: ${ps.signature.length} bytes`);
    });
  }

  // Finalize
  console.log('\n📦 Finalizing transaction...');
  psbt.finalizeAllInputs();
  
  const tx = psbt.extractTransaction();
  const txHex = tx.toHex();
  const txId = tx.getId();

  console.log(`✅ Transaction finalized`);
  console.log(`   Size: ${tx.virtualSize()} vBytes`);
  console.log(`   TXID: ${txId}`);
  console.log(`\n📜 FULL RAW TRANSACTION HEX:`);
  console.log(txHex);
  console.log('');

  // Broadcast
  console.log('\n📡 Broadcasting to Bitcoin Testnet...');
  
  try {
    const broadcastTxid = await broadcastTransaction(txHex);
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                  🎉 BROADCAST SUCCESS! 🎉                      ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    console.log(`🔗 TRANSACTION ID (TXID):`);
    console.log(`   ${broadcastTxid}`);
    console.log('');
    console.log(`🔍 View on Block Explorer:`);
    console.log(`   https://mempool.space/testnet/tx/${broadcastTxid}`);
    console.log('');
    
    // Check confirmation status
    console.log('📊 Checking confirmation status...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const txStatus = await axios.get(
      `https://mempool.space/testnet/api/tx/${broadcastTxid}`,
      { timeout: 30000 }
    );
    
    const confirmed = txStatus.data.status?.confirmed || false;
    const blockHeight = txStatus.data.status?.block_height;
    
    console.log(`\n📊 CONFIRMATION STATUS:`);
    console.log(`   Confirmed: ${confirmed ? '✅ YES' : '⏳ PENDING (in mempool)'}`);
    if (blockHeight) {
      console.log(`   Block Height: ${blockHeight}`);
    }
    
    return {
      success: true,
      txid: broadcastTxid,
      confirmed,
      blockHeight,
      explorerUrl: `https://mempool.space/testnet4/tx/${broadcastTxid}`,
    };
    
  } catch (error) {
    console.error('\n❌ Broadcast failed:', error instanceof Error ? error.message : error);
    if (axios.isAxiosError(error) && error.response) {
      console.error('   Response:', error.response.data);
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

runRealBroadcast()
  .then((result) => {
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('FINAL RESULT:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
