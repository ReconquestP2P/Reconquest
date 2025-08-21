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


def create_multisig_escrow(
    borrower_pubkey_hex: str,
    lender_pubkey_hex: str,
    platform_pubkey_hex: str
) -> Dict[str, Any]:
    """
    Create a 2-of-3 multisig Bitcoin testnet escrow address.
    
    Args:
        borrower_pubkey_hex (str): Borrower's compressed public key in hex format
        lender_pubkey_hex (str): Lender's compressed public key in hex format  
        platform_pubkey_hex (str): Platform's compressed public key in hex format
        
    Returns:
        Dict containing:
        - address (str): The P2SH multisig address for Bitcoin testnet
        - redeem_script (str): The redeem script in hex format
        - script_hash (str): The script hash
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
        
        redeem_script_bytes = bytes(script_bytes)
        
        # Get script hash for P2SH address
        script_hash = hashlib.sha256(redeem_script_bytes).digest()
        ripemd_hash = hashlib.new('ripemd160', script_hash).digest()
        
        # Create P2SH address on testnet
        # Create final address using Base58Check encoding
        # Testnet P2SH addresses use version byte 196 (0xc4)
        payload = bytes([196]) + ripemd_hash
        checksum = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
        address_bytes = payload + checksum
        address = base58.b58encode(address_bytes).decode('utf-8')
        
        # Prepare result
        result = {
            'address': address,
            'redeem_script': redeem_script_bytes.hex(),
            'script_hash': ripemd_hash.hex(),
            'public_keys': [key.public_hex for key in sorted_keys],
            'public_keys_original_order': {
                'borrower': borrower_pubkey_hex,
                'lender': lender_pubkey_hex, 
                'platform': platform_pubkey_hex
            },
            'signatures_required': 2,
            'total_keys': 3,
            'network': 'testnet',
            'address_type': 'P2SH'
        }
        
        return result
        
    except ValueError:
        raise
    except Exception as e:
        raise Exception(f"Failed to create multisig escrow address: {str(e)}")


def verify_multisig_address(address: str, redeem_script_hex: str) -> bool:
    """
    Verify that a given address matches the provided redeem script.
    
    Args:
        address (str): The P2SH address to verify
        redeem_script_hex (str): The redeem script in hex format
        
    Returns:
        bool: True if the address matches the redeem script, False otherwise
    """
    try:
        # Convert hex to bytes
        redeem_script_bytes = bytes.fromhex(redeem_script_hex)
        
        # Calculate script hash
        script_hash = hashlib.sha256(redeem_script_bytes).digest()
        ripemd_hash = hashlib.new('ripemd160', script_hash).digest()
        
        # Generate address from script hash
        payload = bytes([196]) + ripemd_hash
        checksum = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
        address_bytes = payload + checksum
        calculated_address = base58.b58encode(address_bytes).decode('utf-8')
        
        return address == calculated_address
        
    except Exception:
        return False


# Example usage and testing
if __name__ == "__main__":
    # Example compressed public keys for testing (these are dummy keys)
    # In production, these would come from the actual parties
    
    print("Bitcoin Testnet 2-of-3 Multisig Escrow Generator")
    print("=" * 50)
    
    # Example public keys (compressed, 33 bytes each = 66 hex chars)
    example_borrower_pubkey = "02e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    example_lender_pubkey = "031234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    example_platform_pubkey = "02abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    
    try:
        result = create_multisig_escrow(
            example_borrower_pubkey,
            example_lender_pubkey, 
            example_platform_pubkey
        )
        
        print(f"Multisig Address: {result['address']}")
        print(f"Redeem Script: {result['redeem_script']}")
        print(f"Script Hash: {result['script_hash']}")
        print(f"Signatures Required: {result['signatures_required']} of {result['total_keys']}")
        print(f"Network: {result['network']}")
        
        # Verify the address
        is_valid = verify_multisig_address(result['address'], result['redeem_script'])
        print(f"Address Verification: {'✓ Valid' if is_valid else '✗ Invalid'}")
        
        print("\nPublic Keys (sorted):")
        for i, pubkey in enumerate(result['public_keys'], 1):
            print(f"  {i}. {pubkey}")
            
    except Exception as e:
        print(f"Error: {e}")