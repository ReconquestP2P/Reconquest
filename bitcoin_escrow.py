#!/usr/bin/env python3
"""
Bitcoin Testnet 2-of-3 Multisig Escrow Address Generator

This module provides functionality to create a 2-of-3 multisig Bitcoin testnet 
escrow address using the bitcoinlib library. The escrow involves three parties:
- Borrower
- Lender  
- Platform (Reconquest)

Only 2 out of 3 signatures are required to release funds from the escrow.
"""

from bitcoinlib.keys import Key
from bitcoinlib.scripts import Script
from bitcoinlib.encoding import to_hexstring
from bitcoinlib.transactions import Output
from typing import Tuple, Dict, Any
import hashlib
import base58


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
    """Encode a witness program as a bech32 address."""
    ret = hrp + '1'
    converted_bits = convertbits(witprog, 8, 5)
    if converted_bits is None:
        return None
    data = [witver] + converted_bits
    data += bech32_create_checksum(hrp, data)
    ret += ''.join([chr(ord('0') + d) if d < 10 else chr(ord('a') + d - 10) for d in data])
    return ret


def create_multisig_address(pubkey1: str, pubkey2: str, pubkey3: str) -> dict:
    """
    Create a Bitcoin 2-of-3 multisig P2WSH address for testnet (Native SegWit).
    
    Args:
        pubkey1 (str): First compressed public key in hex format (66 chars)
        pubkey2 (str): Second compressed public key in hex format (66 chars)  
        pubkey3 (str): Third compressed public key in hex format (66 chars)
        
    Returns:
        dict: Contains address (P2WSH starting with "tb1"), witness_script (hex), 
              script_pubkey, public_keys, and other metadata
        
    Raises:
        ValueError: If any public key is invalid or not compressed
        Exception: If address generation fails
    """
    return create_multisig_escrow(pubkey1, pubkey2, pubkey3)


def create_multisig_escrow(
    borrower_pubkey_hex: str,
    lender_pubkey_hex: str,
    platform_pubkey_hex: str
) -> Dict[str, Any]:
    """
    Create a 2-of-3 multisig Bitcoin testnet P2WSH escrow address (Native SegWit).
    
    Args:
        borrower_pubkey_hex (str): Borrower's compressed public key in hex format
        lender_pubkey_hex (str): Lender's compressed public key in hex format  
        platform_pubkey_hex (str): Platform's compressed public key in hex format
        
    Returns:
        Dict containing:
        - address (str): The P2WSH multisig address for Bitcoin testnet (starts with "tb1")
        - witness_script (str): The witness script in hex format
        - script_pubkey (str): The ScriptPubKey for P2WSH
        - script_hash (str): The SHA-256 script hash (32 bytes)
        - public_keys (list): List of public keys used
        - signatures_required (int): Number of signatures required (2)
        - total_keys (int): Total number of keys (3)
        
    Raises:
        ValueError: If any public key is invalid or not compressed
        Exception: If address generation fails
    """
    
    try:
        # Validate input public keys
        if not all([borrower_pubkey_hex, lender_pubkey_hex, platform_pubkey_hex]):
            raise ValueError("All three public keys must be provided")
            
        # Convert hex strings to Key objects and validate
        public_keys = []
        pubkey_labels = ["borrower", "lender", "platform"]
        hex_keys = [borrower_pubkey_hex, lender_pubkey_hex, platform_pubkey_hex]
        
        for i, (label, hex_key) in enumerate(zip(pubkey_labels, hex_keys)):
            try:
                # Remove any whitespace or 0x prefix
                clean_hex = hex_key.strip().replace('0x', '')
                
                # Validate hex format
                if not all(c in '0123456789abcdefABCDEF' for c in clean_hex):
                    raise ValueError(f"Invalid hex format for {label} public key")
                
                # Check if compressed public key (33 bytes = 66 hex chars)
                if len(clean_hex) != 66:
                    raise ValueError(f"{label} public key must be compressed (33 bytes/66 hex chars)")
                
                # Create Key object from hex
                key = Key(clean_hex)
                
                # Verify it's a valid public key by checking if we can get the public hex
                try:
                    _ = key.public_hex
                    public_keys.append(key)
                except Exception:
                    raise ValueError(f"Invalid public key for {label}")
                
            except Exception as e:
                raise ValueError(f"Error processing {label} public key: {str(e)}")
        
        # Sort public keys for deterministic script creation
        # This ensures the same address is generated regardless of input order
        sorted_keys = sorted(public_keys, key=lambda k: k.public_hex)
        
        # Create the multisig redeem script (2-of-3) manually
        # Format: OP_2 <pubkey1> <pubkey2> <pubkey3> OP_3 OP_CHECKMULTISIG
        
        # Build script manually as bytes
        script_bytes = bytearray()
        script_bytes.append(0x52)  # OP_2
        
        for key in sorted_keys:
            pubkey_bytes = bytes.fromhex(key.public_hex)
            script_bytes.append(len(pubkey_bytes))  # Push length
            script_bytes.extend(pubkey_bytes)       # Push pubkey
            
        script_bytes.append(0x53)  # OP_3
        script_bytes.append(0xae)  # OP_CHECKMULTISIG
        
        witness_script_bytes = bytes(script_bytes)
        
        # Get script hash for P2WSH (Native SegWit) - SHA-256 only, no RIPEMD160
        script_hash = hashlib.sha256(witness_script_bytes).digest()
        
        # Create P2WSH address on testnet using bech32 encoding
        # Native SegWit addresses use bech32 with witness version 0
        address = encode_bech32_address('tb', 0, script_hash)
        
        # Create ScriptPubKey for P2WSH (OP_0 <32-byte-script-hash>)
        script_pubkey_bytes = bytearray()
        script_pubkey_bytes.append(0x00)  # OP_0 (witness version 0)
        script_pubkey_bytes.append(0x20)  # Push 32 bytes (SHA-256 hash length)
        script_pubkey_bytes.extend(script_hash)
        script_pubkey = bytes(script_pubkey_bytes).hex()

        # Prepare result
        result = {
            'address': address,
            'witness_script': witness_script_bytes.hex(),  # P2WSH uses witness_script instead of redeem_script
            'redeem_script': witness_script_bytes.hex(),   # Keep for backward compatibility
            'script_pubkey': script_pubkey,
            'script_hash': script_hash.hex(),              # P2WSH uses SHA-256 hash (32 bytes)
            'public_keys': [key.public_hex for key in sorted_keys],
            'public_keys_original_order': {
                'borrower': borrower_pubkey_hex,
                'lender': lender_pubkey_hex, 
                'platform': platform_pubkey_hex
            },
            'signatures_required': 2,
            'total_keys': 3,
            'network': 'testnet',
            'address_type': 'P2WSH'                       # Updated to P2WSH (Native SegWit)
        }
        
        return result
        
    except ValueError:
        raise
    except Exception as e:
        raise Exception(f"Failed to create multisig escrow address: {str(e)}")


def verify_multisig_address(address: str, witness_script_hex: str) -> bool:
    """
    Verify that a given P2WSH address matches the provided witness script.
    
    Args:
        address (str): The P2WSH address to verify (starts with "tb1")
        witness_script_hex (str): The witness script in hex format
        
    Returns:
        bool: True if the address matches the witness script, False otherwise
    """
    try:
        # Convert hex to bytes
        witness_script_bytes = bytes.fromhex(witness_script_hex)
        
        # Calculate script hash using SHA-256 only (P2WSH)
        script_hash = hashlib.sha256(witness_script_bytes).digest()
        
        # Generate P2WSH address from script hash
        calculated_address = encode_bech32_address('tb', 0, script_hash)
        
        return address == calculated_address
        
    except Exception:
        return False


# Example usage and testing
if __name__ == "__main__":
    # Example compressed public keys for testing (these are valid testnet keys)
    # In production, these would come from the actual parties
    
    print("Bitcoin Testnet 2-of-3 Multisig Address Generator")
    print("=" * 55)
    print("Requirements: pip install bitcoinlib")
    print("=" * 55)
    
    # Example valid compressed public keys (33 bytes each = 66 hex chars)
    # These are actual valid Bitcoin compressed public keys for testing
    pubkey1 = "02e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    pubkey2 = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
    pubkey3 = "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9"
    
    try:
        # Call the requested function signature
        result = create_multisig_address(pubkey1, pubkey2, pubkey3)
        
        print(f"\n✓ Generated Bitcoin Testnet 2-of-3 Multisig Address:")
        print(f"Address:        {result['address']}")
        print(f"Redeem Script:  {result['redeem_script']}")
        print(f"ScriptPubKey:   {result['script_pubkey']}")
        print(f"Script Hash:    {result['script_hash']}")
        print(f"Requirements:   {result['signatures_required']} of {result['total_keys']} signatures")
        print(f"Network:        {result['network']}")
        print(f"Address Type:   {result['address_type']}")
        
        # Verify the address
        is_valid = verify_multisig_address(result['address'], result['redeem_script'])
        print(f"Verification:   {'✓ Valid' if is_valid else '✗ Invalid'}")
        
        print(f"\nPublic Keys (sorted for deterministic script):")
        for i, pubkey in enumerate(result['public_keys'], 1):
            print(f"  {i}. {pubkey}")
            
        print(f"\n💡 This address can be used for Bitcoin testnet P2P lending escrow.")
        print(f"   Funds sent to this address require 2-of-3 signatures to release.")
            
    except Exception as e:
        print(f"❌ Error: {e}")