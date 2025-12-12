/**
 * Testnet4 End-to-End Escrow Test
 * 
 * This script:
 * 1. Generates deterministic 2-of-3 multisig keys
 * 2. Creates a P2WSH escrow address on Testnet4
 * 3. Waits for user to fund the address
 * 4. Fetches UTXOs from mempool.space
 * 5. Builds and signs a 2-of-3 closing transaction
 * 6. Broadcasts to Testnet4
 * 
 * Run: npx tsx server/testnet4-e2e.ts
 */

import * as tinysecp from 'tiny-secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { TESTNET4_CONFIG } from './services/testnet4-config.js';
import {
  generateTestnet4Multisig,
  getTestSeedPhrases,
  sortPublicKeysBIP67,
} from './services/testnet4-deterministic-keys.js';

// Helper functions
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function reverseHex(hex: string): string {
  const bytes = hexToBytes(hex);
  return bytesToHex(bytes.reverse());
}

function encodeVarInt(n: number): Uint8Array {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
  throw new Error('VarInt too large');
}

function int32ToLE(n: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = n & 0xff;
  buf[1] = (n >> 8) & 0xff;
  buf[2] = (n >> 16) & 0xff;
  buf[3] = (n >> 24) & 0xff;
  return buf;
}

function int64ToLE(n: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    buf[i] = Number((n >> BigInt(i * 8)) & BigInt(0xff));
  }
  return buf;
}

interface UTXO {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}

async function fetchUTXOs(address: string): Promise<UTXO[]> {
  const url = TESTNET4_CONFIG.api.addressUtxo(address);
  console.log(`\n📡 Fetching UTXOs from: ${url}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch UTXOs: ${response.status}`);
  }
  
  const utxos = await response.json() as UTXO[];
  return utxos;
}

async function broadcastTransaction(txHex: string): Promise<string> {
  const url = TESTNET4_CONFIG.api.broadcastTx;
  console.log(`\n📡 Broadcasting to: ${url}`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: txHex,
  });
  
  const result = await response.text();
  
  if (!response.ok) {
    throw new Error(`Broadcast failed: ${result}`);
  }
  
  return result; // Returns TXID
}

/**
 * Create sighash for P2WSH spending (BIP-143)
 */
function createBIP143Sighash(
  txVersion: number,
  prevouts: { txid: string; vout: number }[],
  sequences: number[],
  inputIndex: number,
  witnessScript: Uint8Array,
  amount: bigint,
  outputs: { script: Uint8Array; value: bigint }[],
  locktime: number,
  sighashType: number = 0x01 // SIGHASH_ALL
): Uint8Array {
  // 1. nVersion
  const nVersion = int32ToLE(txVersion);
  
  // 2. hashPrevouts (double SHA256 of all outpoints)
  const prevoutsData: number[] = [];
  for (const p of prevouts) {
    prevoutsData.push(...hexToBytes(reverseHex(p.txid)));
    prevoutsData.push(...int32ToLE(p.vout));
  }
  const hashPrevouts = sha256(sha256(new Uint8Array(prevoutsData)));
  
  // 3. hashSequence (double SHA256 of all sequences)
  const seqData: number[] = [];
  for (const s of sequences) {
    seqData.push(...int32ToLE(s));
  }
  const hashSequence = sha256(sha256(new Uint8Array(seqData)));
  
  // 4. outpoint being spent
  const outpoint = new Uint8Array([
    ...hexToBytes(reverseHex(prevouts[inputIndex].txid)),
    ...int32ToLE(prevouts[inputIndex].vout),
  ]);
  
  // 5. scriptCode (length-prefixed witness script)
  const scriptCode = new Uint8Array([
    ...encodeVarInt(witnessScript.length),
    ...witnessScript,
  ]);
  
  // 6. value being spent (8 bytes LE)
  const valueBytes = int64ToLE(amount);
  
  // 7. nSequence of this input
  const nSequence = int32ToLE(sequences[inputIndex]);
  
  // 8. hashOutputs (double SHA256 of all outputs)
  const outputsData: number[] = [];
  for (const o of outputs) {
    outputsData.push(...int64ToLE(o.value));
    outputsData.push(...encodeVarInt(o.script.length));
    outputsData.push(...o.script);
  }
  const hashOutputs = sha256(sha256(new Uint8Array(outputsData)));
  
  // 9. nLocktime
  const nLocktime = int32ToLE(locktime);
  
  // 10. sighash type (4 bytes LE)
  const sighashBytes = int32ToLE(sighashType);
  
  // Combine all for preimage
  const preimage = new Uint8Array([
    ...nVersion,
    ...hashPrevouts,
    ...hashSequence,
    ...outpoint,
    ...scriptCode,
    ...valueBytes,
    ...nSequence,
    ...hashOutputs,
    ...nLocktime,
    ...sighashBytes,
  ]);
  
  // Double SHA256
  return sha256(sha256(preimage));
}

/**
 * Sign with tiny-secp256k1 and append SIGHASH_ALL byte
 * tiny-secp256k1 returns compact format (64 bytes: r || s) and produces
 * signatures that are Bitcoin-compatible (verified against Bitcoin Core)
 */
function signWithSighashAll(privateKeyHex: string, sighash: Uint8Array): Uint8Array {
  const privateKey = hexToBytes(privateKeyHex);
  
  // tiny-secp256k1.sign returns compact signature (64 bytes: r || s)
  const compactSig = tinysecp.sign(sighash, privateKey);
  if (!compactSig) {
    throw new Error('Failed to sign with tiny-secp256k1');
  }
  
  // Extract r and s from compact format (each 32 bytes)
  const r = compactSig.slice(0, 32);
  const s = compactSig.slice(32, 64);
  
  // Convert to DER format
  const derSig = compactToDER(r, s);
  
  // Append SIGHASH_ALL (0x01)
  const sigWithHashType = new Uint8Array(derSig.length + 1);
  sigWithHashType.set(derSig);
  sigWithHashType[derSig.length] = 0x01;
  
  return sigWithHashType;
}

/**
 * Convert compact r,s bytes to DER format
 */
function compactToDER(r: Uint8Array, s: Uint8Array): Uint8Array {
  // Remove leading zeros but keep at least one byte
  let rTrimmed = trimLeadingZeros(r);
  let sTrimmed = trimLeadingZeros(s);
  
  // Add leading zero if high bit is set (to prevent negative interpretation)
  if (rTrimmed[0] >= 0x80) {
    const padded = new Uint8Array(rTrimmed.length + 1);
    padded[0] = 0;
    padded.set(rTrimmed, 1);
    rTrimmed = padded;
  }
  if (sTrimmed[0] >= 0x80) {
    const padded = new Uint8Array(sTrimmed.length + 1);
    padded[0] = 0;
    padded.set(sTrimmed, 1);
    sTrimmed = padded;
  }
  
  // DER format: 0x30 [total-len] 0x02 [r-len] [r] 0x02 [s-len] [s]
  const totalLen = 2 + rTrimmed.length + 2 + sTrimmed.length;
  const der = new Uint8Array(2 + totalLen);
  
  let offset = 0;
  der[offset++] = 0x30; // SEQUENCE tag
  der[offset++] = totalLen;
  der[offset++] = 0x02; // INTEGER tag for r
  der[offset++] = rTrimmed.length;
  der.set(rTrimmed, offset);
  offset += rTrimmed.length;
  der[offset++] = 0x02; // INTEGER tag for s
  der[offset++] = sTrimmed.length;
  der.set(sTrimmed, offset);
  
  return der;
}

function trimLeadingZeros(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytes.slice(i);
}

/**
 * Create P2WPKH output script for recipient address
 */
function createP2WPKHScript(pubkeyHash: Uint8Array): Uint8Array {
  // OP_0 <20-byte-pubkey-hash>
  return new Uint8Array([0x00, 0x14, ...pubkeyHash]);
}

/**
 * Decode bech32 address to get witness program
 */
function decodeBech32(address: string): { version: number; program: Uint8Array } {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  
  const pos = address.lastIndexOf('1');
  const hrp = address.slice(0, pos);
  const data = address.slice(pos + 1);
  
  const values: number[] = [];
  for (const c of data) {
    const idx = CHARSET.indexOf(c);
    if (idx === -1) throw new Error('Invalid bech32 character');
    values.push(idx);
  }
  
  // Remove checksum (last 6 values)
  const dataValues = values.slice(0, -6);
  
  // First value is witness version
  const version = dataValues[0];
  
  // Convert rest from 5-bit to 8-bit
  const program = convertBits(dataValues.slice(1), 5, 8, false);
  if (!program) throw new Error('Failed to convert bits');
  
  return { version, program: new Uint8Array(program) };
}

function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;
  
  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) return null;
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }
  
  if (pad) {
    if (bits > 0) {
      result.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits) {
    return null;
  }
  
  return result;
}

/**
 * Build a complete SegWit transaction with 2-of-3 multisig witness
 */
function buildMultisigTransaction(
  utxo: UTXO,
  witnessScript: Uint8Array,
  outputAddress: string,
  outputValue: bigint,
  sig1: Uint8Array,
  sig2: Uint8Array,
  sortedPubkeys: string[]
): string {
  const tx: number[] = [];
  
  // Version (4 bytes, little endian)
  tx.push(...int32ToLE(2));
  
  // Marker and Flag for SegWit
  tx.push(0x00, 0x01);
  
  // Input count
  tx.push(0x01);
  
  // Input: txid (reversed), vout, empty scriptSig, sequence
  tx.push(...hexToBytes(reverseHex(utxo.txid)));
  tx.push(...int32ToLE(utxo.vout));
  tx.push(0x00); // Empty scriptSig length
  tx.push(...int32ToLE(0xffffffff)); // Sequence
  
  // Output count
  tx.push(0x01);
  
  // Output: value and script
  tx.push(...int64ToLE(outputValue));
  
  // Decode recipient address and create output script
  const decoded = decodeBech32(outputAddress);
  let outputScript: Uint8Array;
  if (decoded.program.length === 20) {
    // P2WPKH
    outputScript = new Uint8Array([0x00, 0x14, ...decoded.program]);
  } else if (decoded.program.length === 32) {
    // P2WSH
    outputScript = new Uint8Array([0x00, 0x20, ...decoded.program]);
  } else {
    throw new Error('Unknown witness program length');
  }
  
  tx.push(outputScript.length);
  tx.push(...outputScript);
  
  // Witness data for the input
  // For 2-of-3 multisig: <empty> <sig1> <sig2> <witnessScript>
  tx.push(0x04); // 4 witness items
  
  // Empty element (for CHECKMULTISIG bug)
  tx.push(0x00);
  
  // Signature 1
  tx.push(sig1.length);
  tx.push(...sig1);
  
  // Signature 2
  tx.push(sig2.length);
  tx.push(...sig2);
  
  // Witness script
  tx.push(...encodeVarInt(witnessScript.length));
  tx.push(...witnessScript);
  
  // Locktime (4 bytes)
  tx.push(...int32ToLE(0));
  
  return bytesToHex(new Uint8Array(tx));
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║         RECONQUEST - TESTNET4 E2E ESCROW TEST                          ║');
  console.log('║         2-of-3 Multisig with Deterministic Keys                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('Network: TESTNET4');
  console.log('Explorer: https://mempool.space/testnet4');
  console.log();
  
  // Step 1: Generate deterministic multisig
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('STEP 1: Generate Deterministic 2-of-3 Multisig Keys');
  console.log('═══════════════════════════════════════════════════════════════════════');
  
  const multisig = generateTestnet4Multisig();
  const seeds = getTestSeedPhrases();
  
  console.log('\n🔑 DETERMINISTIC SEED PHRASES (for Sparrow import):');
  console.log('   These seeds generate the same keys every time.\n');
  console.log(`   Borrower: "${seeds.borrower}"`);
  console.log(`   Lender:   "${seeds.lender}"`);
  console.log(`   Platform: "${seeds.platform}"`);
  
  console.log('\n🔐 PUBLIC KEYS (compressed, BIP-67 sorted):');
  for (const pk of multisig.sortedPubkeys) {
    console.log(`   ${pk}`);
  }
  
  console.log('\n📜 WITNESS SCRIPT (hex):');
  console.log(`   ${multisig.witnessScriptHex}`);
  
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('STEP 2: Testnet4 Escrow Address');
  console.log('═══════════════════════════════════════════════════════════════════════');
  
  console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
  console.log('│                                                                     │');
  console.log('│   🎯 Send Testnet4 BTC here:                                        │');
  console.log('│                                                                     │');
  console.log(`│   ${multisig.escrowAddress}`);
  console.log('│                                                                     │');
  console.log('└─────────────────────────────────────────────────────────────────────┘');
  
  console.log(`\n🔗 Verify on mempool.space:`);
  console.log(`   ${TESTNET4_CONFIG.explorer.address(multisig.escrowAddress)}`);
  
  // Step 3: Check for UTXOs
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('STEP 3: Checking for UTXOs...');
  console.log('═══════════════════════════════════════════════════════════════════════');
  
  try {
    const utxos = await fetchUTXOs(multisig.escrowAddress);
    
    if (utxos.length === 0) {
      console.log('\n⏳ No UTXOs found. Please fund the address above and run this script again.');
      console.log('\n   Get Testnet4 coins from: https://mempool.space/testnet4/faucet');
      console.log('   Or use Sparrow wallet to send from another Testnet4 address.');
      
      console.log('\n═══════════════════════════════════════════════════════════════════════');
      console.log('READY FOR FUNDING - Run this script again after sending Testnet4 BTC');
      console.log('═══════════════════════════════════════════════════════════════════════');
      
      // Print keys for Sparrow wallet setup
      console.log('\n📋 FOR SPARROW WALLET SETUP:');
      console.log('   Create a "Multisig" wallet with these settings:');
      console.log('   - Type: P2WSH (Native SegWit)');
      console.log('   - M-of-N: 2-of-3');
      console.log('   - Add these 3 public keys:');
      console.log(`     1. ${multisig.keypairs.borrower.publicKeyCompressed}`);
      console.log(`     2. ${multisig.keypairs.lender.publicKeyCompressed}`);
      console.log(`     3. ${multisig.keypairs.platform.publicKeyCompressed}`);
      
      return;
    }
    
    console.log(`\n✅ Found ${utxos.length} UTXO(s):`);
    for (const utxo of utxos) {
      console.log(`   - ${utxo.txid}:${utxo.vout} = ${utxo.value} sats (${utxo.status.confirmed ? 'confirmed' : 'unconfirmed'})`);
    }
    
    // Use the first UTXO
    const utxo = utxos[0];
    const inputValue = BigInt(utxo.value);
    
    // Calculate output value (input minus fee)
    const feeRate = TESTNET4_CONFIG.defaultFeeRate;
    const estimatedVsize = 150; // Approximate for 2-of-3 P2WSH spend
    const fee = BigInt(feeRate * estimatedVsize);
    const outputValue = inputValue - fee;
    
    console.log(`\n💰 Transaction details:`);
    console.log(`   Input:  ${inputValue} sats`);
    console.log(`   Fee:    ${fee} sats (${feeRate} sat/vB)`);
    console.log(`   Output: ${outputValue} sats`);
    
    // Step 4: Build and sign the transaction
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('STEP 4: Building 2-of-3 Multisig Transaction');
    console.log('═══════════════════════════════════════════════════════════════════════');
    
    // Send to borrower's address (derived from their pubkey)
    // For simplicity, we'll send to a P2WPKH derived from borrower's pubkey
    const borrowerPubkeyBytes = hexToBytes(multisig.keypairs.borrower.publicKeyCompressed);
    const borrowerPubkeyHash = sha256(borrowerPubkeyBytes).slice(0, 20);
    
    // Actually, let's generate a proper testnet4 address for output
    // We'll use the platform pubkey hash as output (simulating platform receiving)
    const recipientPubkeyHash = sha256(hexToBytes(multisig.keypairs.platform.publicKeyCompressed)).slice(0, 20);
    
    // Create bech32 P2WPKH address for recipient
    const recipientAddress = bech32EncodeP2WPKH('tb', recipientPubkeyHash);
    console.log(`\n📤 Sending to: ${recipientAddress}`);
    
    // Create sighash
    const witnessScript = hexToBytes(multisig.witnessScriptHex);
    
    const prevouts = [{ txid: utxo.txid, vout: utxo.vout }];
    const sequences = [0xffffffff];
    
    // Create output script for recipient
    const outputScript = new Uint8Array([0x00, 0x14, ...recipientPubkeyHash]);
    const outputs = [{ script: outputScript, value: outputValue }];
    
    const sighash = createBIP143Sighash(
      2, // version
      prevouts,
      sequences,
      0, // input index
      witnessScript,
      inputValue,
      outputs,
      0, // locktime
      0x01 // SIGHASH_ALL
    );
    
    console.log(`\n🔏 Sighash: ${bytesToHex(sighash)}`);
    
    // Sign with borrower and platform (2-of-3)
    console.log('\n✍️ Signing with Borrower key (using tiny-secp256k1)...');
    const sig1 = signWithSighashAll(multisig.keypairs.borrower.privateKeyHex, sighash);
    console.log(`   Signature 1: ${bytesToHex(sig1).slice(0, 40)}...`);
    
    console.log('\n✍️ Signing with Platform key (using tiny-secp256k1)...');
    const sig2 = signWithSighashAll(multisig.keypairs.platform.privateKeyHex, sighash);
    console.log(`   Signature 2: ${bytesToHex(sig2).slice(0, 40)}...`);
    
    // Build the complete transaction
    // Note: Signatures must be in the same order as pubkeys in the script
    const sortedPubkeys = multisig.sortedPubkeys;
    const borrowerPubkey = multisig.keypairs.borrower.publicKeyCompressed;
    const platformPubkey = multisig.keypairs.platform.publicKeyCompressed;
    
    // Determine signature order based on sorted pubkeys
    const borrowerIndex = sortedPubkeys.indexOf(borrowerPubkey);
    const platformIndex = sortedPubkeys.indexOf(platformPubkey);
    
    console.log(`\n🔑 Pubkey ordering debug:`);
    console.log(`   Borrower pubkey: ${borrowerPubkey}`);
    console.log(`   Borrower index in sorted: ${borrowerIndex}`);
    console.log(`   Platform pubkey: ${platformPubkey}`);
    console.log(`   Platform index in sorted: ${platformIndex}`);
    console.log(`   Sorted pubkeys: ${JSON.stringify(sortedPubkeys, null, 2)}`);
    
    let orderedSig1: Uint8Array, orderedSig2: Uint8Array;
    if (borrowerIndex < platformIndex) {
      console.log(`   Order: Borrower sig first, Platform sig second`);
      orderedSig1 = sig1;
      orderedSig2 = sig2;
    } else {
      console.log(`   Order: Platform sig first, Borrower sig second`);
      orderedSig1 = sig2;
      orderedSig2 = sig1;
    }
    
    const txHex = buildMultisigTransaction(
      utxo,
      witnessScript,
      recipientAddress,
      outputValue,
      orderedSig1,
      orderedSig2,
      sortedPubkeys
    );
    
    console.log('\n📦 Raw Transaction Hex:');
    console.log(`   ${txHex}`);
    
    // Step 5: Broadcast
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('STEP 5: Broadcasting to Testnet4');
    console.log('═══════════════════════════════════════════════════════════════════════');
    
    try {
      const txid = await broadcastTransaction(txHex);
      
      console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
      console.log('│                    ✅ BROADCAST SUCCESSFUL!                         │');
      console.log('└─────────────────────────────────────────────────────────────────────┘');
      console.log(`\n   Network: testnet4`);
      console.log(`   TXID: ${txid}`);
      console.log(`\n🔗 View on mempool.space:`);
      console.log(`   ${TESTNET4_CONFIG.explorer.tx(txid)}`);
      
      console.log('\n📋 FULL RESULTS:');
      console.log(JSON.stringify({
        network: 'testnet4',
        txid,
        rawTxHex: txHex,
        escrowAddress: multisig.escrowAddress,
        inputUtxo: `${utxo.txid}:${utxo.vout}`,
        inputValue: utxo.value,
        outputValue: Number(outputValue),
        fee: Number(fee),
      }, null, 2));
      
    } catch (error: any) {
      console.log('\n❌ Broadcast failed:', error.message);
      console.log('\n📦 Transaction hex (for manual broadcast):');
      console.log(`   ${txHex}`);
    }
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  }
}

// Bech32 P2WPKH encoder
function bech32EncodeP2WPKH(hrp: string, pubkeyHash: Uint8Array): string {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  
  const converted = convertBits(Array.from(pubkeyHash), 8, 5, true);
  if (!converted) throw new Error('Failed to convert bits');
  
  const values = [0, ...converted]; // witness version 0
  
  const checksum = createBech32Checksum(hrp, values);
  
  let result = hrp + '1';
  for (const v of [...values, ...checksum]) {
    result += CHARSET[v];
  }
  
  return result;
}

function createBech32Checksum(hrp: string, values: number[]): number[] {
  const BECH32M_CONST = 1; // Use BECH32 (not BECH32M) for witness v0
  const polymod = bech32Polymod([...bech32HrpExpand(hrp), ...values, 0, 0, 0, 0, 0, 0]) ^ BECH32M_CONST;
  const result: number[] = [];
  for (let i = 0; i < 6; i++) {
    result.push((polymod >> (5 * (5 - i))) & 31);
  }
  return result;
}

function bech32HrpExpand(hrp: string): number[] {
  const result: number[] = [];
  for (const c of hrp) {
    result.push(c.charCodeAt(0) >> 5);
  }
  result.push(0);
  for (const c of hrp) {
    result.push(c.charCodeAt(0) & 31);
  }
  return result;
}

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

main().catch(console.error);
