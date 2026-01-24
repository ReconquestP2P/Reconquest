#!/usr/bin/env python3
"""
Bitcoin 3-of-3 Multisig Escrow Address Generator

This module provides functionality to create a 3-of-3 multisig Bitcoin 
escrow address using the bitcoinlib library. The escrow involves three parties:
- Borrower (controls their own key - signs client-side)
- Platform (Reconquest platform key)
- Investor (platform-operated key on behalf of the lender)

IMPORTANT: Lenders are Bitcoin-blind!
- The "investor key" is generated and controlled by the platform
- Lenders NEVER create, see, or sign with Bitcoin keys
- Lender rights are enforced via fiat transfer confirmations
- Platform signs with BOTH platform key AND investor key after fiat verification

All 3 signatures are required to release funds from the escrow.

NETWORK SUPPORT:
- testnet: Generates tb1... addresses (default, safe for testing)
- mainnet: Generates bc1... addresses (requires --confirm-mainnet flag)
"""

from bitcoinlib.keys import Key
from bitcoinlib.scripts import Script
from bitcoinlib.encoding import to_hexstring
from bitcoinlib.transactions import Output
from typing import Tuple, Dict, Any
import hashlib
import base58
import argparse
import sys


# ANSI color codes for terminal output
class Colors:
    RED = '\033[91m'
    YELLOW = '\033[93m'
    GREEN = '\033[92m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    RESET = '\033[0m'


# Network configuration
NETWORK_CONFIG = {
    'testnet': {
        'bech32_prefix': 'tb',
        'display_name': 'Bitcoin Testnet',
        'color': Colors.YELLOW,
    },
    'mainnet': {
        'bech32_prefix': 'bc',
        'display_name': 'Bitcoin Mainnet',
        'color': Colors.RED,
    }
}


def bech32_polymod(values):
    """Internal function for bech32 checksum."""
    GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    chk = 1
    for value in values:
        top = chk >> 25
        chk = (chk & 0x1ffffff) << 5 ^ value
        for i in range(5):
            chk ^= GEN[i] if ((top >> i) & 1) else 0
    return chk


def bech32_hrp_expand(hrp):
    """Expand the HRP into values for checksum computation."""
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]


def bech32_verify_checksum(hrp, data):
    """Verify a checksum given HRP and converted data characters."""
    return bech32_polymod(bech32_hrp_expand(hrp) + data) == 1


def bech32_create_checksum(hrp, data):
    """Compute the checksum values given HRP and data."""
    values = bech32_hrp_expand(hrp) + data
    polymod = bech32_polymod(values + [0, 0, 0, 0, 0, 0]) ^ 1
    return [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]


def convertbits(data, frombits, tobits, pad=True):
    """General power-of-2 base conversion."""
    acc = 0
    bits = 0
    ret = []
    maxv = (1 << tobits) - 1
    max_acc = (1 << (frombits + tobits - 1)) - 1
    for value in data:
        if value < 0 or (value >> frombits):
            return None
        acc = ((acc << frombits) | value) & max_acc
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    if pad:
        if bits:
            ret.append((acc << (tobits - bits)) & maxv)
    elif bits >= frombits or ((acc << (tobits - bits)) & maxv):
        return None
    return ret


def encode_bech32_address(hrp, witver, witprog):
    """Encode a witness program as a bech32 address using correct bech32 charset."""
    CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
    
    ret = hrp + '1'
    converted_bits = convertbits(witprog, 8, 5)
    if converted_bits is None:
        return None
    data = [witver] + converted_bits
    data += bech32_create_checksum(hrp, data)
    ret += ''.join([CHARSET[d] for d in data])
    return ret


def print_network_warning(network: str, silent: bool = False):
    """Print a colored warning about which network is being used."""
    if silent:
        return
        
    config = NETWORK_CONFIG.get(network, NETWORK_CONFIG['testnet'])
    color = config['color']
    display_name = config['display_name']
    
    print(f"\n{color}{Colors.BOLD}{'='*60}{Colors.RESET}")
    print(f"{color}{Colors.BOLD}  NETWORK: {display_name.upper()}{Colors.RESET}")
    print(f"{color}{Colors.BOLD}{'='*60}{Colors.RESET}")
    
    if network == 'mainnet':
        print(f"{Colors.RED}{Colors.BOLD}")
        print("  ⚠️  WARNING: MAINNET MODE - REAL BITCOIN!")
        print("  ⚠️  Double-check all addresses before sending funds!")
        print(f"{Colors.RESET}")
    else:
        print(f"{Colors.YELLOW}")
        print("  ℹ️  Testnet mode - safe for testing")
        print(f"{Colors.RESET}")


def create_multisig_address(pubkey1: str, pubkey2: str, pubkey3: str, network: str = 'testnet') -> dict:
    """
    Create a Bitcoin 3-of-3 multisig P2WSH address (Native SegWit).
    
    Args:
        pubkey1 (str): First compressed public key in hex format (66 chars)
        pubkey2 (str): Second compressed public key in hex format (66 chars)  
        pubkey3 (str): Third compressed public key in hex format (66 chars)
        network (str): 'testnet' or 'mainnet' (default: 'testnet')
        
    Returns:
        dict: Contains address (P2WSH), witness_script (hex), 
              script_pubkey, public_keys, and other metadata
        
    Raises:
        ValueError: If any public key is invalid or not compressed
        Exception: If address generation fails
    """
    return create_multisig_escrow(pubkey1, pubkey2, pubkey3, network=network)


def create_multisig_escrow(
    borrower_pubkey_hex: str,
    investor_pubkey_hex: str,
    platform_pubkey_hex: str,
    network: str = 'testnet'
) -> Dict[str, Any]:
    """
    Create a 3-of-3 multisig Bitcoin P2WSH escrow address (Native SegWit).
    
    IMPORTANT: This implements a Bitcoin-blind lender design:
    - The "investor_pubkey" is generated and controlled by the PLATFORM
    - Lenders NEVER create, see, or handle Bitcoin private keys
    - Lender rights are enforced via fiat transfer confirmations
    - Platform signs with BOTH platform key AND investor key after fiat verification
    
    Args:
        borrower_pubkey_hex (str): Borrower's compressed public key in hex format
        investor_pubkey_hex (str): Platform-operated investor key (for lender's position)
        platform_pubkey_hex (str): Platform's compressed public key in hex format
        network (str): 'testnet' or 'mainnet' (default: 'testnet')
        
    Returns:
        Dict containing:
        - address (str): The P2WSH multisig address (tb1... for testnet, bc1... for mainnet)
        - witness_script (str): The witness script in hex format
        - script_pubkey (str): The ScriptPubKey for P2WSH
        - script_hash (str): The SHA-256 script hash (32 bytes)
        - public_keys (list): List of public keys used (sorted)
        - signatures_required (int): Number of signatures required (3)
        - total_keys (int): Total number of keys (3)
        - network (str): The network used ('testnet' or 'mainnet')
        
    Raises:
        ValueError: If any public key is invalid or not compressed
        ValueError: If network is not 'testnet' or 'mainnet'
        Exception: If address generation fails
    """
    
    # Validate network parameter
    if network not in NETWORK_CONFIG:
        raise ValueError(f"Invalid network '{network}'. Must be 'testnet' or 'mainnet'")
    
    try:
        if not all([borrower_pubkey_hex, investor_pubkey_hex, platform_pubkey_hex]):
            raise ValueError("All three public keys must be provided")
            
        public_keys = []
        pubkey_labels = ["borrower", "investor", "platform"]
        hex_keys = [borrower_pubkey_hex, investor_pubkey_hex, platform_pubkey_hex]
        
        for i, (label, hex_key) in enumerate(zip(pubkey_labels, hex_keys)):
            try:
                clean_hex = hex_key.strip().replace('0x', '')
                
                if not all(c in '0123456789abcdefABCDEF' for c in clean_hex):
                    raise ValueError(f"Invalid hex format for {label} public key")
                
                if len(clean_hex) != 66:
                    raise ValueError(f"{label} public key must be compressed (33 bytes/66 hex chars)")
                
                key = Key(clean_hex)
                
                try:
                    _ = key.public_hex
                    public_keys.append(key)
                except Exception:
                    raise ValueError(f"Invalid public key for {label}")
                
            except Exception as e:
                raise ValueError(f"Error processing {label} public key: {str(e)}")
        
        sorted_keys = sorted(public_keys, key=lambda k: k.public_hex)
        
        script_bytes = bytearray()
        script_bytes.append(0x53)  # OP_3 (require 3 signatures)
        
        for key in sorted_keys:
            pubkey_bytes = bytes.fromhex(key.public_hex)
            script_bytes.append(len(pubkey_bytes))
            script_bytes.extend(pubkey_bytes)
            
        script_bytes.append(0x53)  # OP_3 (total keys)
        script_bytes.append(0xae)  # OP_CHECKMULTISIG
        
        witness_script_bytes = bytes(script_bytes)
        
        script_hash = hashlib.sha256(witness_script_bytes).digest()
        
        # Use network-specific bech32 prefix
        bech32_prefix = NETWORK_CONFIG[network]['bech32_prefix']
        address = encode_bech32_address(bech32_prefix, 0, script_hash)
        
        script_pubkey_bytes = bytearray()
        script_pubkey_bytes.append(0x00)
        script_pubkey_bytes.append(0x20)
        script_pubkey_bytes.extend(script_hash)
        script_pubkey = bytes(script_pubkey_bytes).hex()

        result = {
            'address': address,
            'witness_script': witness_script_bytes.hex(),
            'redeem_script': witness_script_bytes.hex(),
            'script_pubkey': script_pubkey,
            'script_hash': script_hash.hex(),
            'public_keys': [key.public_hex for key in sorted_keys],
            'public_keys_original_order': {
                'borrower': borrower_pubkey_hex,
                'investor': investor_pubkey_hex,
                'platform': platform_pubkey_hex
            },
            'signatures_required': 3,
            'total_keys': 3,
            'network': network,
            'address_type': 'P2WSH',
            'lender_bitcoin_blind': True
        }
        
        return result
        
    except ValueError:
        raise
    except Exception as e:
        raise Exception(f"Failed to create 3-of-3 escrow address: {str(e)}")


def verify_multisig_address(address: str, witness_script_hex: str, network: str = 'testnet') -> bool:
    """
    Verify that a given P2WSH address matches the provided witness script.
    
    Args:
        address (str): The P2WSH address to verify
        witness_script_hex (str): The witness script in hex format
        network (str): 'testnet' or 'mainnet' (default: 'testnet')
        
    Returns:
        bool: True if the address matches the witness script, False otherwise
    """
    try:
        if network not in NETWORK_CONFIG:
            return False
            
        witness_script_bytes = bytes.fromhex(witness_script_hex)
        script_hash = hashlib.sha256(witness_script_bytes).digest()
        bech32_prefix = NETWORK_CONFIG[network]['bech32_prefix']
        calculated_address = encode_bech32_address(bech32_prefix, 0, script_hash)
        return address == calculated_address
        
    except Exception:
        return False


def main():
    """Main entry point with CLI argument parsing."""
    parser = argparse.ArgumentParser(
        description='Bitcoin 3-of-3 Multisig Escrow Address Generator',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python bitcoin_escrow.py --network testnet
  python bitcoin_escrow.py --network mainnet --confirm-mainnet
  
Network Prefixes:
  testnet: Generates tb1... addresses (safe for testing)
  mainnet: Generates bc1... addresses (REAL BITCOIN!)
        """
    )
    
    parser.add_argument(
        '--network',
        type=str,
        choices=['testnet', 'mainnet'],
        default='testnet',
        help='Bitcoin network to use (default: testnet)'
    )
    
    parser.add_argument(
        '--confirm-mainnet',
        action='store_true',
        help='Required confirmation flag for mainnet address generation'
    )
    
    parser.add_argument(
        '--silent',
        action='store_true',
        help='Suppress network warning banners (for programmatic use)'
    )
    
    parser.add_argument(
        '--borrower-pubkey',
        type=str,
        help='Borrower public key (hex, 66 chars)'
    )
    
    parser.add_argument(
        '--investor-pubkey',
        type=str,
        help='Investor/Lender public key (hex, 66 chars)'
    )
    
    parser.add_argument(
        '--platform-pubkey',
        type=str,
        help='Platform public key (hex, 66 chars)'
    )
    
    args = parser.parse_args()
    
    # Safety check for mainnet
    if args.network == 'mainnet' and not args.confirm_mainnet:
        print(f"{Colors.RED}{Colors.BOLD}")
        print("ERROR: Mainnet address generation requires --confirm-mainnet flag!")
        print("")
        print("This is a safety measure to prevent accidental mainnet address generation.")
        print("If you really want to generate a mainnet address, run:")
        print("")
        print("  python bitcoin_escrow.py --network mainnet --confirm-mainnet")
        print(f"{Colors.RESET}")
        sys.exit(1)
    
    # Print network warning
    print_network_warning(args.network, args.silent)
    
    if not args.silent:
        print("Bitcoin 3-of-3 Multisig Address Generator")
        print("=" * 60)
        print("DESIGN: Bitcoin-blind lenders")
        print("  - Borrower: Client-side key (user controls)")
        print("  - Platform: Platform signing key")
        print("  - Investor: Platform-operated key (for lender's position)")
        print("=" * 60)
    
    # Use provided keys or default test keys
    if args.borrower_pubkey and args.investor_pubkey and args.platform_pubkey:
        pubkey_borrower = args.borrower_pubkey
        pubkey_investor = args.investor_pubkey
        pubkey_platform = args.platform_pubkey
    else:
        # Default test keys for demonstration
        pubkey_borrower = "02e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        pubkey_investor = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
        pubkey_platform = "03b1d168ccdfa27364697797909170da9177db95449f7a8ef5311be8b37717976e"
        
        if not args.silent:
            print("\nUsing default test keys for demonstration...")
    
    try:
        result = create_multisig_escrow(
            pubkey_borrower, 
            pubkey_investor, 
            pubkey_platform,
            network=args.network
        )
        
        config = NETWORK_CONFIG[args.network]
        color = config['color']
        
        print(f"\n{color}✓ Generated Bitcoin {config['display_name']} 3-of-3 Multisig Address:{Colors.RESET}")
        print(f"{color}Address:        {result['address']}{Colors.RESET}")
        print(f"Witness Script: {result['witness_script']}")
        print(f"ScriptPubKey:   {result['script_pubkey']}")
        print(f"Script Hash:    {result['script_hash']}")
        print(f"Requirements:   {result['signatures_required']} of {result['total_keys']} signatures")
        print(f"Network:        {result['network']}")
        print(f"Address Type:   {result['address_type']}")
        print(f"Lender Blind:   {result['lender_bitcoin_blind']}")
        
        is_valid = verify_multisig_address(result['address'], result['witness_script'], network=args.network)
        print(f"Verification:   {'✓ Valid' if is_valid else '✗ Invalid'}")
        
        print(f"\nPublic Keys (sorted for deterministic script):")
        for i, pubkey in enumerate(result['public_keys'], 1):
            print(f"  {i}. {pubkey}")
            
        print(f"\n💡 Signing responsibilities:")
        print(f"   - Borrower: Signs client-side with passphrase-derived key")
        print(f"   - Platform: Signs with platform key (after verification)")
        print(f"   - Investor: Platform signs after lender confirms fiat")
        print(f"   - Lender: ONLY confirms fiat transfers (no Bitcoin interaction)")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
