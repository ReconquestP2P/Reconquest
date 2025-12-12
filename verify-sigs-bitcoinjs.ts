import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

bitcoin.initEccLib(ecc);

function bytesToHex(bytes: Buffer | Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

const txHex = '02000000000101de66ccdb334b767992c9fe06dde33b727867972aed56da7260d00d7026ddf7260000000000ffffffff01f49f070000000000160014b8a00a87c4c0ead4645165318eb0ecb3521b180404004830450221009d2848c6a73b0437c96b132b9c42e79db9b1f910ae02b5218546179360c74d9602200fe7ae95155fa2e05069b73eb9e5abce936ae5e1913fd12b4cd1df1a205c30ef014830450221009f8f05cdcd5d79f17125352cbd455bfb25b987189982e484ee94fafd2b5e809502207dea9f9c2fd73e04f6cafd657f47011707e2f71931761b9846fe78646f0acad50169522102394e7e2d0d098ec27287d2b7e9aee3e6a3943e55d268158aa47320ce20f2f42a2103b1d168ccdfa27364697797909170da9177db95449f7a8ef5311be8b37717976e2103ea7e493ac2f8fb9d1a24f860bb0d6f92b98be4ec667ddac179283a555dd5fbeb53ae00000000';

const witnessScriptHex = '522102394e7e2d0d098ec27287d2b7e9aee3e6a3943e55d268158aa47320ce20f2f42a2103b1d168ccdfa27364697797909170da9177db95449f7a8ef5311be8b37717976e2103ea7e493ac2f8fb9d1a24f860bb0d6f92b98be4ec667ddac179283a555dd5fbeb53ae';
const inputValue = 500000n;

const tx = bitcoin.Transaction.fromHex(txHex);
const witnessScript = Buffer.from(witnessScriptHex, 'hex');

console.log('=== bitcoinjs-lib sighash verification ===');
const hashType = bitcoin.Transaction.SIGHASH_ALL;
const sighash = tx.hashForWitnessV0(0, witnessScript, inputValue, hashType);
console.log('Sighash match:', bytesToHex(sighash) === 'acc0a8f9482f6d4e2dea210f968fef4fd44d1a9aa166c6e98702e20b0263d6f3');

// Verify signatures using ecc.verify with DER signature
const sig1 = tx.ins[0].witness[1].slice(0, -1); // Remove sighash byte
const sig2 = tx.ins[0].witness[2].slice(0, -1);

const pubkey1 = Buffer.from('02394e7e2d0d098ec27287d2b7e9aee3e6a3943e55d268158aa47320ce20f2f42a', 'hex');
const pubkey2 = Buffer.from('03b1d168ccdfa27364697797909170da9177db95449f7a8ef5311be8b37717976e', 'hex');

// Use script.signature module from bitcoinjs-lib to decode DER
const decoded1 = bitcoin.script.signature.decode(tx.ins[0].witness[1]);
const decoded2 = bitcoin.script.signature.decode(tx.ins[0].witness[2]);

console.log('\nSig1 hashType:', decoded1.hashType);
console.log('Sig2 hashType:', decoded2.hashType);

// Verify using ecc - need to convert signature to compact format
// The signature from decode is in DER format, we need to parse r,s
function derToCompact(derSig: Buffer): Buffer {
  let offset = 0;
  if (derSig[offset++] !== 0x30) throw new Error('Invalid DER');
  const len = derSig[offset++];
  if (derSig[offset++] !== 0x02) throw new Error('Invalid DER r');
  const rLen = derSig[offset++];
  let r = derSig.subarray(offset, offset + rLen);
  offset += rLen;
  if (derSig[offset++] !== 0x02) throw new Error('Invalid DER s');
  const sLen = derSig[offset++];
  let s = derSig.subarray(offset, offset + sLen);
  
  // Remove leading zeros
  if (r.length > 32) r = r.subarray(r.length - 32);
  if (s.length > 32) s = s.subarray(s.length - 32);
  
  // Pad to 32 bytes
  const compact = Buffer.alloc(64);
  r.copy(compact, 32 - r.length);
  s.copy(compact, 64 - s.length);
  return compact;
}

const compact1 = derToCompact(decoded1.signature);
const compact2 = derToCompact(decoded2.signature);

console.log('\nCompact1:', bytesToHex(compact1));
console.log('Compact2:', bytesToHex(compact2));

const valid1 = ecc.verify(sighash, pubkey1, compact1);
const valid2 = ecc.verify(sighash, pubkey2, compact2);

console.log('\nSig1 valid for pubkey[0] (borrower):', valid1);
console.log('Sig2 valid for pubkey[1] (platform):', valid2);
