/**
 * Test Script: Deterministic Outcome Engine
 * 
 * Demonstrates the outcome engine deciding DEFAULT for an overdue, unpaid loan
 */

import type { Loan, DisputeEvidence } from '@shared/schema';
import { decideLoanOutcome, buildEvidenceFromLoan, getTransactionHexForOutcome } from './services/outcome-engine';

// Create mock loan data for different scenarios
function createMockLoan(overrides: Partial<Loan> = {}): Loan {
  const now = new Date();
  const pastDueDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
  
  return {
    id: 1,
    borrowerId: 1,
    lenderId: 2,
    amount: '5000.00',
    currency: 'USD',
    interestRate: '8.50',
    termMonths: 3,
    collateralBtc: '0.10000000',
    ltvRatio: '0.50',
    purpose: 'Business expansion',
    status: 'active',
    requestedAt: new Date('2024-09-01'),
    fundedAt: new Date('2024-09-05'),
    dueDate: pastDueDate,
    repaidAt: null,
    escrowAddress: 'tb1q33z96zrk0t63rderlaxtc3kmrvxw8acfaf6ncx84rt3xl25jvrgs39wtat',
    escrowWitnessScript: '522102...',
    escrowScriptHash: 'abc123...',
    borrowerPubkey: '0205c88a9f9c6cb72284412d1220b6be81a6604f186d3cf92c1a1296f6a2ae43c8',
    lenderPubkey: '031cd924d53fc274211ef9e01d68076f1a504a0940c8126bbec089a85f4be80efe',
    platformPubkey: '036253f1e2223fffae4cce476eb87f86b0f863f030f0ec1803e020014d2a2e037b',
    fundingTxid: '59718c4d98813e293a9aea5268288ff87229a1ee235fcd4e7b9170800672cd80',
    fundingVout: 0,
    fundedAmountSats: 10000,
    escrowState: 'keys_generated',
    escrowSessionId: 'session-123',
    fiatTransferConfirmed: false, // Lender NOT confirmed paid
    borrowerConfirmedReceipt: false,
    btcDepositNotifiedAt: null,
    depositConfirmedAt: new Date('2024-09-06'),
    borrowerKeysGeneratedAt: new Date('2024-09-06'),
    lenderKeysGeneratedAt: new Date('2024-09-06'),
    loanStartedAt: new Date('2024-09-06'),
    disputeStatus: 'under_review',
    disputeResolvedAt: null,
    txRepaymentHex: '020000000001...(mock repayment tx)',
    txDefaultHex: '020000000001...(mock default tx)',
    txLiquidationHex: '020000000001...(mock liquidation tx)',
    txRecoveryHex: '020000000001...(mock recovery tx)',
    txCancellationHex: '020000000001...(mock cancellation tx)',
    ...overrides,
  };
}

function runTest(testName: string, loan: Loan, btcPrice: number, expectedOutcome: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST: ${testName}`);
  console.log('='.repeat(70));

  const evidence = buildEvidenceFromLoan(loan, btcPrice);
  const now = new Date();
  const decision = decideLoanOutcome(loan, evidence, now);

  console.log('\n📋 LOAN STATE:');
  console.log(`   - Lender funded: ${loan.lenderId !== null && loan.fundedAt !== null}`);
  console.log(`   - Due date: ${loan.dueDate?.toISOString() || 'N/A'}`);
  console.log(`   - Past due: ${loan.dueDate ? now > loan.dueDate : false}`);
  console.log(`   - Lender confirmed paid: ${loan.fiatTransferConfirmed}`);
  console.log(`   - Collateral: ${loan.collateralBtc} BTC`);
  console.log(`   - BTC Price: $${btcPrice.toLocaleString()}`);

  console.log('\n📊 EVIDENCE:');
  console.log(`   ${JSON.stringify(evidence, null, 2).split('\n').join('\n   ')}`);

  console.log('\n⚖️ DECISION:');
  console.log(`   Outcome:    ${decision.outcome}`);
  console.log(`   Rule:       ${decision.ruleFired}`);
  console.log(`   TX Type:    ${decision.txTypeToUse}`);
  console.log(`   Reasoning:  ${decision.reasoning}`);

  const txHex = getTransactionHexForOutcome(loan, decision.txTypeToUse);
  console.log(`\n📦 TX HEX AVAILABLE: ${txHex ? 'YES' : 'NO'}`);

  const passed = decision.outcome === expectedOutcome;
  console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'}: Expected ${expectedOutcome}, got ${decision.outcome}`);
  
  return passed;
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║           DETERMINISTIC OUTCOME ENGINE - TEST SUITE                    ║');
  console.log('║   Platform NEVER chooses a side - rules map facts to outcomes         ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');

  const results: boolean[] = [];
  const btcPrice = 97000;

  // TEST 1: DEFAULT - Past due, lender not paid
  const defaultLoan = createMockLoan({
    dueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    fiatTransferConfirmed: false,
  });
  results.push(runTest(
    'DEFAULT SCENARIO - Loan overdue, borrower did not pay',
    defaultLoan,
    btcPrice,
    'DEFAULT'
  ));

  // TEST 2: COOPERATIVE_CLOSE - Lender confirmed paid
  const cooperativeLoan = createMockLoan({
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    fiatTransferConfirmed: true,
  });
  results.push(runTest(
    'COOPERATIVE CLOSE - Lender confirmed payment received',
    cooperativeLoan,
    btcPrice,
    'COOPERATIVE_CLOSE'
  ));

  // TEST 3: CANCELLATION - Lender never funded
  const cancelledLoan = createMockLoan({
    lenderId: null,
    fundedAt: null,
  });
  results.push(runTest(
    'CANCELLATION - Lender never funded the loan',
    cancelledLoan,
    btcPrice,
    'CANCELLATION'
  ));

  // TEST 4: LIQUIDATION - Price dropped below threshold
  const liquidationLoan = createMockLoan({
    amount: '10000.00', // $10,000 loan
    collateralBtc: '0.10000000', // 0.1 BTC collateral
    fiatTransferConfirmed: false,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Not yet due
  });
  const lowBtcPrice = 50000; // $50k * 0.1 BTC = $5000 collateral < $11000 threshold (110% of $10k loan)
  results.push(runTest(
    'LIQUIDATION - BTC price dropped below liquidation threshold',
    liquidationLoan,
    lowBtcPrice,
    'LIQUIDATION'
  ));

  // TEST 5: UNDER_REVIEW - Not yet due, no clear outcome
  const pendingLoan = createMockLoan({
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    fiatTransferConfirmed: false,
    borrowerConfirmedReceipt: false,
  });
  results.push(runTest(
    'UNDER REVIEW - Loan not yet due, no payment confirmation',
    pendingLoan,
    btcPrice,
    'UNDER_REVIEW'
  ));

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          TEST SUMMARY                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`\n📊 Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n🎉 ALL TESTS PASSED! Outcome engine is working correctly.');
  } else {
    console.log('\n❌ Some tests failed. Review the output above.');
  }
}

main().catch(console.error);
