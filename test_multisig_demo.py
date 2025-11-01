#!/usr/bin/env python3
"""
Bitcoin Testnet Multisig Demo - Educational Tool
Demonstrates proper 2-of-3 multisig escrow with REAL keys

This shows how the Reconquest platform SHOULD work:
1. Generate real Bitcoin keypairs (with private keys)
2. Create a 2-of-3 multisig P2WSH address
3. Show how to sign and spend from the escrow
"""

from bitcoinlib.keys import Key
from bitcoin_escrow import create_multisig_escrow
import json

def generate_real_keypair(label: str, network='testnet'):
    """Generate a real Bitcoin keypair with actual private key"""
    key = Key(network=network)
    return {
        'label': label,
        'private_key_hex': key.private_hex,
        'private_key_wif': key.wif(),
        'public_key': key.public_hex,
        'address': key.address()
    }

def main():
    print("=" * 80)
    print("BITCOIN TESTNET 2-OF-3 MULTISIG DEMONSTRATION")
    print("=" * 80)
    print("\n⚠️  IMPORTANT: This is for educational purposes on testnet only!")
    print("    In production, private keys should NEVER be displayed or stored on servers.\n")
    
    # Step 1: Generate three real keypairs
    print("Step 1: Generating THREE real Bitcoin keypairs...\n")
    
    borrower_keys = generate_real_keypair("Borrower")
    lender_keys = generate_real_keypair("Lender")
    platform_keys = generate_real_keypair("Platform")
    
    all_keys = [borrower_keys, lender_keys, platform_keys]
    
    # Display all keys
    for keys in all_keys:
        print(f"🔑 {keys['label']} Keys:")
        print(f"   Public Key:  {keys['public_key']}")
        print(f"   Private Key: {keys['private_key_hex']}")
        print(f"   WIF Format:  {keys['private_key_wif']}")
        print(f"   P2WPKH Addr: {keys['address']}")
        print()
    
    # Step 2: Create 2-of-3 multisig escrow address
    print("=" * 80)
    print("Step 2: Creating 2-of-3 Multisig Escrow Address...\n")
    
    result = create_multisig_escrow(
        borrower_keys['public_key'],
        lender_keys['public_key'],
        platform_keys['public_key']
    )
    
    print(f"✅ Multisig Address Created Successfully!\n")
    print(f"📍 Escrow Address: {result['address']}")
    print(f"   Address Type:   {result['address_type']}")
    print(f"   Network:        {result['network']}")
    print(f"   Required Sigs:  {result['signatures_required']} of {result['total_keys']}")
    print()
    print(f"📜 Witness Script (hex):")
    print(f"   {result['witness_script']}")
    print()
    print(f"🔐 Script Hash (SHA-256):")
    print(f"   {result['script_hash']}")
    print()
    
    # Step 3: Instructions for funding
    print("=" * 80)
    print("Step 3: How to Fund This Escrow (Testnet)\n")
    print(f"1. Get testnet Bitcoin from a faucet:")
    print(f"   • https://coinfaucet.eu/en/btc-testnet/")
    print(f"   • https://testnet-faucet.mempool.co/")
    print()
    print(f"2. Send testnet BTC to this address:")
    print(f"   {result['address']}")
    print()
    print(f"3. Check the transaction on a block explorer:")
    print(f"   https://blockstream.info/testnet/address/{result['address']}")
    print()
    
    # Step 4: Instructions for spending
    print("=" * 80)
    print("Step 4: How to Spend From This Escrow\n")
    print(f"To spend funds from this escrow, you need 2 of the 3 private keys.")
    print(f"You can use any combination:")
    print(f"   • Borrower + Lender")
    print(f"   • Borrower + Platform")
    print(f"   • Lender + Platform")
    print()
    print(f"Example using Bitcoin Core (testnet):")
    print(f"   1. Import the witness script")
    print(f"   2. Create a PSBT (Partially Signed Bitcoin Transaction)")
    print(f"   3. Sign with 2 private keys")
    print(f"   4. Broadcast the fully signed transaction")
    print()
    
    # Save keys to JSON file for reference
    output_data = {
        'escrow_address': result['address'],
        'witness_script': result['witness_script'],
        'script_hash': result['script_hash'],
        'signatures_required': result['signatures_required'],
        'total_keys': result['total_keys'],
        'network': result['network'],
        'keys': {
            'borrower': {
                'public_key': borrower_keys['public_key'],
                'private_key_wif': borrower_keys['private_key_wif'],
                'private_key_hex': borrower_keys['private_key_hex']
            },
            'lender': {
                'public_key': lender_keys['public_key'],
                'private_key_wif': lender_keys['private_key_wif'],
                'private_key_hex': lender_keys['private_key_hex']
            },
            'platform': {
                'public_key': platform_keys['public_key'],
                'private_key_wif': platform_keys['private_key_wif'],
                'private_key_hex': platform_keys['private_key_hex']
            }
        },
        'explorer_url': f"https://blockstream.info/testnet/address/{result['address']}"
    }
    
    output_file = 'multisig_demo_keys.json'
    with open(output_file, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print("=" * 80)
    print(f"💾 All keys and details saved to: {output_file}")
    print()
    print("⚠️  SECURITY WARNING:")
    print("   • These are REAL private keys for testnet")
    print("   • Keep this file secure - anyone with 2 of these keys can spend the funds")
    print("   • In production, private keys should NEVER be stored together like this")
    print("   • The Reconquest platform uses browser-side WASM to keep keys safe")
    print()
    print("=" * 80)
    print("✅ Demo Complete! You now have a working testnet multisig escrow.")
    print()
    print("Next steps:")
    print("  1. Send some testnet BTC to the escrow address")
    print("  2. Use a Bitcoin wallet that supports P2WSH to spend (with 2 signatures)")
    print("  3. Or use bitcoin-cli to create/sign PSBTs")
    print()

if __name__ == "__main__":
    main()
