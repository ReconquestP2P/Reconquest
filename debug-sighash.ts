import { sha256 } from '@noble/hashes/sha2.js';
import * as secp256k1 from '@noble/secp256k1';

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

function encodeVarInt(n: number): Uint8Array {
  if (n < 0xfd) return new Uint8Array([n]);
  throw new Error('VarInt too large');
}

// Transaction data
const txid = '26f7dd26700dd06072da56ed2a976778723be3dd06fec99279764b33dbcc66de';
const vout = 0;
const inputValue = 500000n;
const outputValue = 499700n;

// Witness script (2-of-3 multisig)
const witnessScriptHex = '522102394e7e2d0d098ec27287d2b7e9aee3e6a3943e55d268158aa47320ce20f2f42a2103b1d168ccdfa27364697797909170da9177db95449f7a8ef5311be8b37717976e2103ea7e493ac2f8fb9d1a24f860bb0d6f92b98be4ec667ddac179283a555dd5fbeb53ae';
const witnessScript = hexToBytes(witnessScriptHex);

// Output script
const outputScriptHex = '0014b8a00a87c4c0ead4645165318eb0ecb3521b1804';
const outputScript = hexToBytes(outputScriptHex);

console.log('=== BIP-143 SIGHASH DEBUG ===\n');

// 1. nVersion
const nVersion = int32ToLE(2);
console.log('1. nVersion:', bytesToHex(nVersion));

// 2. hashPrevouts
const prevoutsData = new Uint8Array([
  ...hexToBytes(reverseHex(txid)),
  ...int32ToLE(vout)
]);
console.log('2a. Prevouts data:', bytesToHex(prevoutsData));
const hashPrevouts = sha256(sha256(prevoutsData));
console.log('2b. hashPrevouts:', bytesToHex(hashPrevouts));

// 3. hashSequence
const seqData = int32ToLE(0xffffffff);
const hashSequence = sha256(sha256(seqData));
console.log('3. hashSequence:', bytesToHex(hashSequence));

// 4. outpoint
const outpoint = new Uint8Array([
  ...hexToBytes(reverseHex(txid)),
  ...int32ToLE(vout)
]);
console.log('4. outpoint:', bytesToHex(outpoint));

// 5. scriptCode (length-prefixed witness script)
const scriptCode = new Uint8Array([
  ...encodeVarInt(witnessScript.length),
  ...witnessScript
]);
console.log('5. scriptCode:', bytesToHex(scriptCode));
console.log('   scriptCode length:', scriptCode.length);

// 6. value being spent
const valueBytes = int64ToLE(inputValue);
console.log('6. value:', bytesToHex(valueBytes), '=', inputValue, 'sats');

// 7. nSequence
const nSequence = int32ToLE(0xffffffff);
console.log('7. nSequence:', bytesToHex(nSequence));

// 8. hashOutputs
const outputsData = new Uint8Array([
  ...int64ToLE(outputValue),
  ...encodeVarInt(outputScript.length),
  ...outputScript
]);
console.log('8a. Outputs data:', bytesToHex(outputsData));
const hashOutputs = sha256(sha256(outputsData));
console.log('8b. hashOutputs:', bytesToHex(hashOutputs));

// 9. nLocktime
const nLocktime = int32ToLE(0);
console.log('9. nLocktime:', bytesToHex(nLocktime));

// 10. sighash type
const sighashBytes = int32ToLE(0x01);
console.log('10. sighashType:', bytesToHex(sighashBytes));

// Build preimage
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
  ...sighashBytes
]);

console.log('\n=== PREIMAGE ===');
console.log('Length:', preimage.length);
console.log('Preimage hex:', bytesToHex(preimage));

// Double SHA256
const sighash = sha256(sha256(preimage));
console.log('\n=== SIGHASH ===');
console.log('Sighash:', bytesToHex(sighash));
console.log('Expected: acc0a8f9482f6d4e2dea210f968fef4fd44d1a9aa166c6e98702e20b0263d6f3');

// Verify it matches what the script computed
console.log('Match:', bytesToHex(sighash) === 'acc0a8f9482f6d4e2dea210f968fef4fd44d1a9aa166c6e98702e20b0263d6f3');
