#!/usr/bin/env npx ts-node
/**
 * MAINNET PLATFORM SIGNING KEY GENERATOR
 * 
 * This script generates a cryptographically secure secp256k1 key pair
 * for signing Bitcoin mainnet transactions.
 * 
 * SECURITY REQUIREMENTS:
 * - Run on a secure, offline machine if possible
 * - Clear terminal history after copying keys
 * - Never commit output to version control
 * - Store private key in hardware security module (HSM) for production
 * 
 * Usage: npx ts-node server/scripts/generate-mainnet-key.ts
 */

import crypto from 'crypto';
import * as secp256k1 from '@noble/secp256k1';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function generateSecureKeyPair(): { privateKey: string; publicKey: string } {
  const privateKeyBytes = crypto.randomBytes(32);
  const privateKeyHex = privateKeyBytes.toString('hex');
  
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
  const publicKeyHex = Buffer.from(publicKeyBytes).toString('hex');
  
  return {
    privateKey: privateKeyHex,
    publicKey: publicKeyHex
  };
}

function validateKeyPair(privateKey: string, publicKey: string): boolean {
  try {
    const privateKeyBytes = Buffer.from(privateKey, 'hex');
    const derivedPublicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
    const derivedPublicKeyHex = Buffer.from(derivedPublicKeyBytes).toString('hex');
    
    return derivedPublicKeyHex === publicKey;
  } catch (error) {
    return false;
  }
}

function validateKeyFormat(privateKey: string, publicKey: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (privateKey.length !== 64) {
    errors.push(`Private key must be 64 hex chars (got ${privateKey.length})`);
  }
  
  if (!/^[0-9a-f]{64}$/i.test(privateKey)) {
    errors.push('Private key must be valid hexadecimal');
  }
  
  if (publicKey.length !== 66) {
    errors.push(`Public key must be 66 hex chars (got ${publicKey.length})`);
  }
  
  if (!/^(02|03)[0-9a-f]{64}$/i.test(publicKey)) {
    errors.push('Public key must start with 02 or 03 (compressed format)');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

function main() {
  console.log();
  console.log(`${RED}${BOLD}🔴 ════════════════════════════════════════════════════════${RESET}`);
  console.log(`${RED}${BOLD}🔴 MAINNET PLATFORM KEY GENERATION${RESET}`);
  console.log(`${RED}${BOLD}🔴 THESE KEYS CONTROL REAL BITCOIN${RESET}`);
  console.log(`${RED}${BOLD}🔴 ════════════════════════════════════════════════════════${RESET}`);
  console.log();
  
  console.log(`${CYAN}Generating cryptographically secure key pair...${RESET}`);
  console.log(`${CYAN}Using: crypto.randomBytes(32) + @noble/secp256k1${RESET}`);
  console.log();
  
  const { privateKey, publicKey } = generateSecureKeyPair();
  
  const formatValidation = validateKeyFormat(privateKey, publicKey);
  if (!formatValidation.valid) {
    console.log(`${RED}❌ Key format validation failed:${RESET}`);
    formatValidation.errors.forEach(err => console.log(`   - ${err}`));
    process.exit(1);
  }
  
  const derivationValid = validateKeyPair(privateKey, publicKey);
  if (!derivationValid) {
    console.log(`${RED}❌ Key derivation validation failed!${RESET}`);
    console.log(`${RED}   Public key does not match private key.${RESET}`);
    process.exit(1);
  }
  
  console.log(`${YELLOW}Private Key (store in .env as secret):${RESET}`);
  console.log(`${BOLD}PLATFORM_SIGNING_KEY=${privateKey}${RESET}`);
  console.log();
  
  console.log(`${YELLOW}Public Key (update in BitcoinEscrowService.ts):${RESET}`);
  console.log(`${BOLD}PLATFORM_PUBLIC_KEY="${publicKey}"${RESET}`);
  console.log();
  
  console.log(`${GREEN}✅ Keys validated - public key correctly derived from private${RESET}`);
  console.log(`${GREEN}   Private key: ${privateKey.length} hex chars${RESET}`);
  console.log(`${GREEN}   Public key:  ${publicKey.length} hex chars (${publicKey.substring(0, 2)} prefix = compressed)${RESET}`);
  console.log();
  
  console.log(`${YELLOW}⚠️  SECURITY CHECKLIST:${RESET}`);
  console.log(`${YELLOW}[ ] Private key copied to password manager / HSM${RESET}`);
  console.log(`${YELLOW}[ ] Replit Secrets updated with PLATFORM_SIGNING_KEY${RESET}`);
  console.log(`${YELLOW}[ ] BitcoinEscrowService.ts updated with PLATFORM_PUBLIC_KEY${RESET}`);
  console.log(`${YELLOW}[ ] This terminal output cleared/deleted${RESET}`);
  console.log(`${YELLOW}[ ] NEVER commit private key to Git${RESET}`);
  console.log(`${YELLOW}[ ] Consider HSM/KMS for production key storage${RESET}`);
  console.log();
  
  console.log(`${RED}${BOLD}🔴 ════════════════════════════════════════════════════════${RESET}`);
  console.log(`${RED}${BOLD}🔴 SECURE THIS KEY - IT CONTROLS PLATFORM BITCOIN SIGNING${RESET}`);
  console.log(`${RED}${BOLD}🔴 ════════════════════════════════════════════════════════${RESET}`);
  console.log();
}

main();
