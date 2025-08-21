#!/usr/bin/env python3

# Generate valid example public keys for testing
def create_valid_pubkeys():
    # Valid compressed public keys for Bitcoin (33 bytes = 66 hex chars)
    # These start with 02 or 03 and have 64 more hex characters (32 bytes)
    
    # Create valid example keys
    borrower_key = "02" + "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    lender_key = "03" + "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    platform_key = "02" + "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    
    print(f"Borrower:  {borrower_key} ({len(borrower_key)} chars)")
    print(f"Lender:    {lender_key} ({len(lender_key)} chars)")
    print(f"Platform:  {platform_key} ({len(platform_key)} chars)")
    
    return borrower_key, lender_key, platform_key

if __name__ == "__main__":
    create_valid_pubkeys()