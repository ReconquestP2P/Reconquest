import * as bitcoin from 'bitcoinjs-lib';

const txHex = '02000000000101de66ccdb334b767992c9fe06dde33b727867972aed56da7260d00d7026ddf7260000000000ffffffff01f49f070000000000160014b8a00a87c4c0ead4645165318eb0ecb3521b180404004830450221009d2848c6a73b0437c96b132b9c42e79db9b1f910ae02b5218546179360c74d9602200fe7ae95155fa2e05069b73eb9e5abce936ae5e1913fd12b4cd1df1a205c30ef014830450221009f8f05cdcd5d79f17125352cbd455bfb25b987189982e484ee94fafd2b5e809502207dea9f9c2fd73e04f6cafd657f47011707e2f71931761b9846fe78646f0acad50169522102394e7e2d0d098ec27287d2b7e9aee3e6a3943e55d268158aa47320ce20f2f42a2103b1d168ccdfa27364697797909170da9177db95449f7a8ef5311be8b37717976e2103ea7e493ac2f8fb9d1a24f860bb0d6f92b98be4ec667ddac179283a555dd5fbeb53ae00000000';

try {
  const tx = bitcoin.Transaction.fromHex(txHex);
  console.log('=== Transaction Decoded by bitcoinjs-lib ===');
  console.log('Version:', tx.version);
  console.log('Locktime:', tx.locktime);
  console.log('Inputs:', tx.ins.length);
  console.log('Outputs:', tx.outs.length);
  
  // Input details
  console.log('\n--- Input 0 ---');
  const inp = tx.ins[0];
  console.log('Prev txid:', inp.hash.reverse().toString('hex'));
  console.log('Prev vout:', inp.index);
  console.log('Sequence:', inp.sequence.toString(16));
  console.log('Witness items:', inp.witness.length);
  
  for (let i = 0; i < inp.witness.length; i++) {
    console.log(`  Witness[${i}] (${inp.witness[i].length} bytes):`, 
      inp.witness[i].length > 0 ? inp.witness[i].toString('hex').slice(0, 40) + '...' : '(empty)');
  }
  
  // Decode the witness script
  const witnessScript = inp.witness[3];
  console.log('\n--- Witness Script Analysis ---');
  console.log('Full script:', witnessScript.toString('hex'));
  
  // Parse multisig script
  let offset = 0;
  const m = witnessScript[offset++] - 0x50; // OP_2 = 0x52 = OP_SMALLINT + 2
  console.log('Required sigs (m):', m);
  
  const pubkeys: string[] = [];
  while (offset < witnessScript.length - 2) {
    const len = witnessScript[offset++];
    const pubkey = witnessScript.slice(offset, offset + len).toString('hex');
    pubkeys.push(pubkey);
    offset += len;
  }
  
  const n = witnessScript[offset++] - 0x50;
  console.log('Total keys (n):', n);
  console.log('Pubkeys:');
  for (let i = 0; i < pubkeys.length; i++) {
    console.log(`  [${i}] ${pubkeys[i]}`);
  }
  
  // Verify the signatures match the pubkeys they should be for
  console.log('\n--- Signature Analysis ---');
  const sig1 = inp.witness[1];
  const sig2 = inp.witness[2];
  
  console.log('Sig 1 (should match pubkey 0):', sig1.toString('hex'));
  console.log('Sig 2 (should match pubkey 1):', sig2.toString('hex'));
  
  // For 2-of-3 CHECKMULTISIG, signatures must be in the same order as the pubkeys
  // Sig1 should be for pubkey[0], Sig2 should be for pubkey[1]
  
} catch (e) {
  console.error('Error:', e);
}
