import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
bitcoin.initEccLib(ecc);

const { storage } = await import('./server/storage.ts');
const txs = await storage.getPreSignedTransactions(213);
const repayment = txs.find(t => t.txType === 'repayment');

if (!repayment) { console.log('No repayment PSBT found'); process.exit(1); }

const psbt = bitcoin.Psbt.fromBase64(repayment.psbt);
const input = psbt.data.inputs[0];
const txInput = psbt.txInputs[0];

console.log('PSBT Input TXID:', Buffer.from(txInput.hash).reverse().toString('hex'));
console.log('PSBT Input VOUT:', txInput.index);
console.log('Has witnessScript:', !!input.witnessScript);
console.log('Has partialSig:', !!input.partialSig, 'count:', input.partialSig?.length || 0);
console.log('Has witnessUtxo:', !!input.witnessUtxo);

if (input.witnessScript) {
  console.log('Witness script hex:', input.witnessScript.toString('hex'));
}

console.log('\nSignature field from DB:', repayment.signature ? repayment.signature.substring(0, 80) + '...' : 'NULL');
console.log('Signature length:', repayment.signature?.length || 0);

// Check actual funded UTXO
const loan = await storage.getLoan(213);
console.log('\nExpected funding TXID:', loan.fundingTxid);
console.log('Expected funding VOUT:', loan.fundingVout);
