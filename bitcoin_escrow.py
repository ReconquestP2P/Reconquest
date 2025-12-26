#!/usr/bin/env python3
"""
Bitcoin Testnet 2-of-2 Multisig Escrow Address Generator

This module provides functionality to create a 2-of-2 multisig Bitcoin testnet 
escrow address using the bitcoinlib library. The escrow involves two parties:
- Borrower (controls their collateral)
- Platform (Reconquest - enforces loan terms)

IMPORTANT: Lenders are Bitcoin-blind. They do NOT participate in Bitcoin signing.
The lender's rights are enforced via platform logic and fiat transfer confirmations.

Both signatures (borrower + platform) are required to release funds from the escrow.
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


def create_multisig_address(pubkey1: str, pubkey2: str) -> dict:
    """
    Create a Bitcoin 2-of-2 multisig P2WSH address for testnet (Native SegWit).
    
    Args:
        pubkey1 (str): First compressed public key in hex format (66 chars)
        pubkey2 (str): Second compressed public key in hex format (66 chars)  
        
    Returns:
        dict: Contains address (P2WSH starting with "tb1"), witness_script (hex), 
              script_pubkey, public_keys, and other metadata
        
    Raises:
        ValueError: If any public key is invalid or not compressed
        Exception: If address generation fails
    """
    return create_2of2_escrow(pubkey1, pubkey2)


def create_2of2_escrow(
    borrower_pubkey_hex: str,
    platform_pubkey_hex: str
) -> Dict[str, Any]:
    """
    Create a 2-of-2 multisig Bitcoin testnet P2WSH escrow address (Native SegWit).
    
    IMPORTANT: This is a Bitcoin-blind lender design. Lenders do NOT have keys.
    The lender's rights are enforced via platform logic (fiat transfer confirmations).
    
    Args:
        borrower_pubkey_hex (str): Borrower's compressed public key in hex format
        platform_pubkey_hex (str): Platform's compressed public key in hex format
        
    Returns:
        Dict containing:
        - address (str): The P2WSH multisig address for Bitcoin testnet (starts with "tb1")
        - witness_script (str): The witness script in hex format
        - script_pubkey (str): The ScriptPubKey for P2WSH
        - script_hash (str): The SHA-256 script hash (32 bytes)
        - public_keys (list): List of public keys used
        - signatures_required (int): Number of signatures required (2)
        - total_keys (int): Total number of keys (2)
        
    Raises:
        ValueError: If any public key is invalid or not compressed
        Exception: If address generation fails
    """
    
    try:
        if not all([borrower_pubkey_hex, platform_pubkey_hex]):
            raise ValueError("Both borrower and platform public keys must be provided")
            
        public_keys = []
        pubkey_labels = ["borrower", "platform"]
        hex_keys = [borrower_pubkey_hex, platform_pubkey_hex]
        
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
        script_bytes.append(0x52)  # OP_2
        
        for key in sorted_keys:
            pubkey_bytes = bytes.fromhex(key.public_hex)
            script_bytes.append(len(pubkey_bytes))
            script_bytes.extend(pubkey_bytes)
            
        script_bytes.append(0x52)  # OP_2 (total keys)
        script_bytes.append(0xae)  # OP_CHECKMULTISIG
        
        witness_script_bytes = bytes(script_bytes)
        
        script_hash = hashlib.sha256(witness_script_bytes).digest()
        
        address = encode_bech32_address('tb', 0, script_hash)
        
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
                'platform': platform_pubkey_hex
            },
            'signatures_required': 2,
            'total_keys': 2,
            'network': 'testnet',
            'address_type': 'P2WSH',
            'lender_involved': False
        }
        
        return result
        
    except ValueError:
        raise
    except Exception as e:
        raise Exception(f"Failed to create 2-of-2 escrow address: {str(e)}")


def create_multisig_escrow(
    borrower_pubkey_hex: str,
    lender_pubkey_hex: str,
    platform_pubkey_hex: str
) -> Dict[str, Any]:
    """
    DEPRECATED: Legacy 2-of-3 multisig function.
    
    This function is kept for backward compatibility but now creates a 2-of-2 escrow
    using only borrower and platform keys. The lender key is ignored.
    
    Lenders are Bitcoin-blind - they do not hold keys or sign transactions.
    """
    print("WARNING: create_multisig_escrow is deprecated. Lender key is ignored.")
    print("Creating 2-of-2 escrow with borrower and platform keys only.")
    return create_2of2_escrow(borrower_pubkey_hex, platform_pubkey_hex)


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
        witness_script_bytes = bytes.fromhex(witness_script_hex)
        script_hash = hashlib.sha256(witness_script_bytes).digest()
        calculated_address = encode_bech32_address('tb', 0, script_hash)
        return address == calculated_address
        
    except Exception:
        return False


if __name__ == "__main__":
    print("Bitcoin Testnet 2-of-2 Multisig Address Generator")
    print("=" * 55)
    print("DESIGN: Bitcoin-blind lenders - only borrower + platform keys")
    print("=" * 55)
    
    pubkey_borrower = "02e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    pubkey_platform = "03b1d168ccdfa27364697797909170da9177db95449f7a8ef5311be8b37717976e"
    
    try:
        result = create_2of2_escrow(pubkey_borrower, pubkey_platform)
        
        print(f"\n✓ Generated Bitcoin Testnet 2-of-2 Multisig Address:")
        print(f"Address:        {result['address']}")
        print(f"Witness Script: {result['witness_script']}")
        print(f"ScriptPubKey:   {result['script_pubkey']}")
        print(f"Script Hash:    {result['script_hash']}")
        print(f"Requirements:   {result['signatures_required']} of {result['total_keys']} signatures")
        print(f"Network:        {result['network']}")
        print(f"Address Type:   {result['address_type']}")
        print(f"Lender Keys:    NOT REQUIRED (Bitcoin-blind design)")
        
        is_valid = verify_multisig_address(result['address'], result['witness_script'])
        print(f"Verification:   {'✓ Valid' if is_valid else '✗ Invalid'}")
        
        print(f"\nPublic Keys (sorted for deterministic script):")
        for i, pubkey in enumerate(result['public_keys'], 1):
            print(f"  {i}. {pubkey}")
            
        print(f"\n💡 This escrow requires BOTH signatures to spend:")
        print(f"   - Borrower: Controls their collateral")
        print(f"   - Platform: Enforces loan terms based on fiat confirmations")
        print(f"   - Lender: NO BITCOIN INVOLVEMENT (fiat only)")
            
    except Exception as e:
        print(f"❌ Error: {e}")
