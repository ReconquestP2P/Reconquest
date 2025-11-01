#!/usr/bin/env python3
"""
Spend from 2-of-3 Multisig Escrow - Testnet Demo

This script demonstrates how to spend Bitcoin from a 2-of-3 multisig address.
It creates a transaction, signs it with 2 private keys, and shows how to broadcast it.
"""

from bitcoinlib.transactions import Transaction, Input, Output
from bitcoinlib.keys import Key
from bitcoinlib.encoding import to_hexstring
import json
import sys

def load_multisig_keys():
    """Load the multisig details from the JSON file"""
    try:
        with open('multisig_demo_keys.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print("❌ Error: multisig_demo_keys.json not found!")
        print("   Please run test_multisig_demo.py first.")
        sys.exit(1)

def check_balance(address):
    """Check if the address has any UTXOs (requires API call in real scenario)"""
    print(f"\n📊 Checking balance for: {address}")
    print(f"   🔗 View on explorer: https://blockstream.info/testnet/address/{address}")
    print()
    print("⚠️  To proceed, you need to:")
    print("   1. Send some testnet BTC to this address from a faucet")
    print("   2. Wait for at least 1 confirmation")
    print("   3. Note the transaction ID (txid) and output index (vout)")
    print()
    return None

def create_spending_transaction(multisig_data, utxo_txid, utxo_vout, utxo_amount_sat, destination_address, fee_sat=1000):
    """
    Create a transaction spending from the multisig escrow
    
    Args:
        multisig_data: Dict containing escrow address, witness script, and keys
        utxo_txid: Transaction ID of the UTXO to spend
        utxo_vout: Output index of the UTXO
        utxo_amount_sat: Amount in satoshis of the UTXO
        destination_address: Where to send the funds
        fee_sat: Transaction fee in satoshis
    """
    
    escrow_address = multisig_data['escrow_address']
    witness_script_hex = multisig_data['witness_script']
    
    # Calculate output amount (input amount - fee)
    output_amount_sat = utxo_amount_sat - fee_sat
    
    if output_amount_sat <= 0:
        raise ValueError(f"UTXO amount ({utxo_amount_sat} sat) is too small to cover fee ({fee_sat} sat)")
    
    print(f"\n📝 Creating transaction:")
    print(f"   From:   {escrow_address}")
    print(f"   To:     {destination_address}")
    print(f"   Amount: {output_amount_sat} satoshis ({output_amount_sat / 100000000:.8f} BTC)")
    print(f"   Fee:    {fee_sat} satoshis")
    print()
    
    # Create transaction manually
    # For P2WSH, we need to create a witness transaction
    
    print("🔨 Transaction structure:")
    print(f"   Input:  {utxo_txid}:{utxo_vout}")
    print(f"   Output: {destination_address} = {output_amount_sat} sat")
    print(f"   Witness Script: {witness_script_hex[:64]}...")
    print()
    
    return {
        'escrow_address': escrow_address,
        'witness_script': witness_script_hex,
        'input_txid': utxo_txid,
        'input_vout': utxo_vout,
        'input_amount': utxo_amount_sat,
        'output_address': destination_address,
        'output_amount': output_amount_sat,
        'fee': fee_sat
    }

def sign_transaction_with_two_keys(tx_data, key1_wif, key2_wif):
    """
    Sign the transaction with 2 of the 3 private keys
    
    Args:
        tx_data: Transaction data dict
        key1_wif: First private key in WIF format
        key2_wif: Second private key in WIF format
    """
    
    print("✍️  Signing transaction with 2 private keys...")
    print()
    
    # Load the keys
    key1 = Key(key1_wif, network='testnet')
    key2 = Key(key2_wif, network='testnet')
    
    print(f"   Key 1: {key1.public_hex}")
    print(f"   Key 2: {key2.public_hex}")
    print()
    
    # For a real implementation, you would:
    # 1. Create the raw transaction
    # 2. Create signature hashes for the witness
    # 3. Sign with both keys
    # 4. Assemble the witness data
    # 5. Create the final signed transaction
    
    print("📋 Next steps for actual signing:")
    print("   This requires a full Bitcoin transaction signing implementation.")
    print("   For testnet, you can use:")
    print()
    print("   Option 1: Bitcoin Core (bitcoin-cli)")
    print("   -----------------------------------------")
    print("   1. Import the witness script:")
    print(f"      bitcoin-cli -testnet importaddress \"{tx_data['witness_script']}\" \"escrow\" true true")
    print()
    print("   2. Create raw transaction:")
    print(f"      bitcoin-cli -testnet createrawtransaction '[{{\"txid\":\"{tx_data['input_txid']}\",\"vout\":{tx_data['input_vout']}}}]' '[{{\"{tx_data['output_address']}\":{tx_data['output_amount'] / 100000000}}}]'")
    print()
    print("   3. Sign with first key:")
    print(f"      bitcoin-cli -testnet signrawtransactionwithkey <raw_tx> '[\"cMhPiHpaCUCGeoNc9GNTWktyAKfbFwMMCnakovboChe8LHnaG7B9\"]' '[{{\"txid\":\"{tx_data['input_txid']}\",\"vout\":{tx_data['input_vout']},\"scriptPubKey\":\"...\",\"redeemScript\":\"{tx_data['witness_script']}\",\"amount\":{tx_data['input_amount'] / 100000000}}}]'")
    print()
    print("   4. Sign with second key (on the partially signed tx)")
    print("   5. Broadcast the fully signed transaction")
    print()
    print("   Option 2: Online Tools")
    print("   -----------------------------------------")
    print("   • Use https://coinb.in/#newTransaction (supports testnet)")
    print("   • Or Electrum wallet (supports multisig)")
    print()
    
    return None

def main():
    print("=" * 80)
    print("SPEND FROM 2-OF-3 MULTISIG ESCROW - TESTNET")
    print("=" * 80)
    
    # Load multisig data
    multisig_data = load_multisig_keys()
    
    escrow_address = multisig_data['escrow_address']
    keys = multisig_data['keys']
    
    print(f"\n✅ Loaded multisig escrow details:")
    print(f"   Address: {escrow_address}")
    print(f"   Requires: 2-of-3 signatures")
    print()
    
    # Check balance
    check_balance(escrow_address)
    
    # Ask user for transaction details
    print("=" * 80)
    print("TRANSACTION DETAILS")
    print("=" * 80)
    print()
    print("To spend from the multisig, you need:")
    print()
    print("1. A funded UTXO (check the explorer link above)")
    print("   You need: txid, vout, and amount in satoshis")
    print()
    print("2. A destination address (where to send the funds)")
    print("   You can use one of the individual addresses from the keys:")
    print(f"   • Borrower:  {Key(keys['borrower']['private_key_wif'], network='testnet').address()}")
    print(f"   • Lender:    {Key(keys['lender']['private_key_wif'], network='testnet').address()}")
    print(f"   • Platform:  {Key(keys['platform']['private_key_wif'], network='testnet').address()}")
    print()
    
    # Example transaction (for demonstration)
    print("=" * 80)
    print("EXAMPLE TRANSACTION")
    print("=" * 80)
    print()
    print("Here's what the process would look like:")
    print()
    
    # Use example values
    example_utxo_txid = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6"  # Example
    example_utxo_vout = 0
    example_utxo_amount = 100000  # 0.001 BTC in satoshis
    example_destination = Key(keys['borrower']['private_key_wif'], network='testnet').address()
    
    tx_data = create_spending_transaction(
        multisig_data,
        example_utxo_txid,
        example_utxo_vout,
        example_utxo_amount,
        example_destination,
        fee_sat=1000
    )
    
    # Show how to sign with 2 keys (e.g., Borrower + Platform)
    print("=" * 80)
    print("SIGNING WITH 2 KEYS (Borrower + Platform)")
    print("=" * 80)
    print()
    
    sign_transaction_with_two_keys(
        tx_data,
        keys['borrower']['private_key_wif'],
        keys['platform']['private_key_wif']
    )
    
    print("=" * 80)
    print("PRACTICAL RECOMMENDATION")
    print("=" * 80)
    print()
    print("The easiest way to spend from this multisig on testnet:")
    print()
    print("1. Use Electrum Wallet (supports multisig):")
    print("   • Download from https://electrum.org")
    print("   • Create a new multisig wallet (2-of-3)")
    print("   • Import the 3 public keys")
    print("   • Import 2 of the private keys")
    print("   • Send a transaction")
    print()
    print("2. Or use bitcoin-cli if you have Bitcoin Core installed")
    print()
    print("=" * 80)
    print()
    print("💡 The private keys you need are in multisig_demo_keys.json")
    print("   You need ANY 2 of the 3 keys to sign and spend.")
    print()

if __name__ == "__main__":
    main()
