import { PsbtCreatorService } from '../server/services/PsbtCreatorService.js';
import { db } from '../server/db.js';
import { preSignedTransactions, loans } from '../shared/schema.js';
import { eq, and } from 'drizzle-orm';

async function main() {
  const LOAN_ID = 240;
  const FUNDING_TXID = 'df7f1c16457cce255f5283bf3196382c10ec49fb6b7281b7f60446f9926760b2';
  const FUNDING_VOUT = 1;
  const COLLATERAL_SATS = 117647;
  const WITNESS_SCRIPT = '532102934880997e04e867bacc523e1fc0cda745a15a2a40ae5cee3399287682f27e052102de90382786735a687483499d27ba9495f877352a6a9d2d293a479fe3d46ad087210317ba664ae972bcfd7b78ea165d78f134ecedd11965c6d025f0cfe8ef94882b7c53ae';
  const BORROWER_ADDRESS = 'bc1qh8vlp7k2syqs0s90shd7a8fctq0xyd3kkwp9ta';
  const BORROWER_PUBKEY = '02de90382786735a687483499d27ba9495f877352a6a9d2d293a479fe3d46ad087';
  const LENDER_PUBKEY = '02934880997e04e867bacc523e1fc0cda745a15a2a40ae5cee3399287682f27e05';
  const PLATFORM_PUBKEY = '0317ba664ae972bcfd7b78ea165d78f134ecedd11965c6d025f0cfe8ef94882b7c';
  const PLATFORM_BTC_ADDRESS = process.env.PLATFORM_BTC_ADDRESS || '';

  const escrowUtxo = { txid: FUNDING_TXID, vout: FUNDING_VOUT, amount: COLLATERAL_SATS };

  // 1. REPAYMENT PSBT — collateral returns to borrower
  const repayment = PsbtCreatorService.createRepaymentPsbt({
    witnessScriptHex: WITNESS_SCRIPT,
    escrowUtxo,
    borrowerAddress: BORROWER_ADDRESS
  });
  console.log('✅ REPAYMENT PSBT created, hash:', repayment.txHash);

  // 2. DEFAULT PSBT — lender prefers EUR so BTC goes to PLATFORM_BTC_ADDRESS
  let defaultPsbt: any = null;
  if (PLATFORM_BTC_ADDRESS) {
    const amountOwedSats = Math.round((50 * 1.05) / 84297 * 100_000_000);
    defaultPsbt = PsbtCreatorService.createDefaultLiquidationPsbt({
      witnessScriptHex: WITNESS_SCRIPT,
      escrowUtxo,
      lenderAddress: PLATFORM_BTC_ADDRESS,
      borrowerAddress: BORROWER_ADDRESS,
      amountOwedSats
    });
    console.log('✅ DEFAULT PSBT created, hash:', defaultPsbt.txHash);
  } else {
    console.warn('⚠️  PLATFORM_BTC_ADDRESS not set — skipping DEFAULT PSBT');
  }

  // 3. RECOVERY PSBT — borrower can recover after timelock if platform disappears
  const timelockBlocks = (3 * 30 * 144) + (14 * 144);
  const recovery = PsbtCreatorService.createRecoveryPsbt({
    pubkeys: [BORROWER_PUBKEY, LENDER_PUBKEY, PLATFORM_PUBKEY],
    escrowUtxo,
    borrowerAddress: BORROWER_ADDRESS,
    timelockBlocks
  });
  console.log('✅ RECOVERY PSBT created, hash:', recovery.txHash);

  // 4. Upsert all templates into pre_signed_transactions
  const templates = [
    { txType: 'repayment', psbt: repayment.psbtBase64, txHash: repayment.txHash },
    ...(defaultPsbt ? [{ txType: 'default', psbt: defaultPsbt.psbtBase64, txHash: defaultPsbt.txHash }] : []),
    { txType: 'recovery', psbt: recovery.psbtBase64, txHash: recovery.txHash }
  ];

  for (const tmpl of templates) {
    const existing = await db.select().from(preSignedTransactions)
      .where(and(
        eq(preSignedTransactions.loanId, LOAN_ID),
        eq(preSignedTransactions.txType, tmpl.txType)
      ));

    if (existing.length > 0) {
      await db.update(preSignedTransactions)
        .set({ psbt: tmpl.psbt, signature: '', broadcastStatus: 'pending', txHash: tmpl.txHash })
        .where(eq(preSignedTransactions.id, existing[0].id));
      console.log(`   Updated ${tmpl.txType} template (id ${existing[0].id})`);
    } else {
      await db.insert(preSignedTransactions).values({
        loanId: LOAN_ID,
        partyRole: 'unsigned_template',
        partyPubkey: BORROWER_PUBKEY,
        txType: tmpl.txType,
        psbt: tmpl.psbt,
        signature: '',
        txHash: tmpl.txHash
      });
      console.log(`   Created ${tmpl.txType} template`);
    }
  }

  // 5. Reset signing complete flag and clear the stored error
  await db.update(loans)
    .set({ borrowerSigningComplete: false, collateralReleaseError: null })
    .where(eq(loans.id, LOAN_ID));

  console.log('✅ Reset borrowerSigningComplete = false, cleared collateral release error');
  console.log('\n✅ Step 1 complete. Borrower must now re-sign via the signing ceremony in their dashboard.');
}

main().catch(e => { console.error(e); process.exit(1); });
