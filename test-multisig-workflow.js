#!/usr/bin/env node

/**
 * Test Script for Bitcoin Multisig Escrow Workflow
 * Tests the complete flow from loan offer to multisig escrow creation
 */

const BASE_URL = 'http://localhost:5000';

// Example Bitcoin public keys (compressed, 66 hex chars)
const TEST_KEYS = {
  borrower: "02e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  lender: "031234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  platform: "02abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
};

async function testMultisigWorkflow() {
  console.log('🚀 Testing Bitcoin Multisig Escrow Workflow\n');

  try {
    // Step 1: Get available loans
    console.log('1. Getting available loans...');
    const loansResponse = await fetch(`${BASE_URL}/api/loans/available`);
    const loans = await loansResponse.json();
    console.log(`   Found ${loans.length} available loans`);
    
    if (loans.length === 0) {
      console.log('   ❌ No available loans found. Create a loan first.');
      return;
    }

    const testLoan = loans[0];
    console.log(`   📋 Using loan #${testLoan.id}: ${testLoan.amount} ${testLoan.currency}\n`);

    // Step 2: Create a loan offer
    console.log('2. Creating loan offer...');
    const offerData = {
      loanId: testLoan.id,
      amount: testLoan.amount,
      interestRate: "10.5"
    };

    const offerResponse = await fetch(`${BASE_URL}/api/loan-offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(offerData)
    });

    if (!offerResponse.ok) {
      const error = await offerResponse.json();
      console.log('   ❌ Failed to create loan offer:', error);
      return;
    }

    const offer = await offerResponse.json();
    console.log(`   ✅ Created offer #${offer.id} for ${offer.amount} ${testLoan.currency}\n`);

    // Step 3: Accept loan offer with Bitcoin public keys
    console.log('3. Accepting loan offer with Bitcoin public keys...');
    console.log(`   📝 Borrower pubkey: ${TEST_KEYS.borrower}`);
    console.log(`   📝 Lender pubkey: ${TEST_KEYS.lender}`);
    
    const acceptData = {
      borrowerPubkey: TEST_KEYS.borrower,
      lenderPubkey: TEST_KEYS.lender
    };

    const acceptResponse = await fetch(`${BASE_URL}/api/loan-offers/${offer.id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(acceptData)
    });

    if (!acceptResponse.ok) {
      const error = await acceptResponse.json();
      console.log('   ❌ Failed to accept loan offer:', error);
      return;
    }

    const result = await acceptResponse.json();
    
    if (result.success) {
      console.log('   🎉 Loan offer accepted successfully!\n');
      
      console.log('📊 MULTISIG ESCROW DETAILS:');
      console.log('==============================');
      console.log(`🏦 Escrow Address: ${result.escrowAddress}`);
      console.log(`🔐 Redeem Script: ${result.redeemScript}`);
      console.log(`👤 Borrower Key: ${result.borrowerPubkey}`);
      console.log(`🏛️ Lender Key: ${result.lenderPubkey}`);
      console.log(`⚙️ Platform Key: ${result.platformPubkey}`);
      console.log(`📋 Loan ID: ${result.loanId}`);
      console.log('==============================\n');
      
      console.log('📋 NEXT STEPS:');
      console.log(`1. Borrower deposits ${testLoan.collateralBtc} BTC to: ${result.escrowAddress}`);
      console.log(`2. Transaction requires 2 of 3 signatures (borrower, lender, platform)`);
      console.log(`3. Funds are secured until loan terms are fulfilled\n`);
      
      console.log('✅ Test completed successfully!');
      
    } else {
      console.log('   ❌ Loan acceptance failed:', result.message);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Utility function to validate Bitcoin testnet address
function validateTestnetAddress(address) {
  return address.startsWith('2') || address.startsWith('tb1');
}

// Run the test
console.log('Starting in 2 seconds...\n');
setTimeout(testMultisigWorkflow, 2000);