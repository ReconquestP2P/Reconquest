import type { Loan } from '@shared/schema';

/**
 * ResponseSanitizer - Ensures sensitive data is NEVER exposed via API
 * 
 * CRITICAL SECURITY:
 * - Lender private keys must NEVER be returned in API responses
 * - Platform signing keys must NEVER be exposed
 * - Encryption keys must NEVER be logged or returned
 */

// Fields that must NEVER be returned in API responses
const SENSITIVE_LOAN_FIELDS = [
  'lenderPrivateKeyEncrypted',
  'platformPrivateKey',
  'encryptionKey',
  'signingSecret'
] as const;

// Fields that should be redacted in logs
const LOG_SENSITIVE_FIELDS = [
  'lenderPrivateKeyEncrypted',
  'platformPrivateKey',
  'password',
  'passphrase',
  'privateKey'
] as const;

export class ResponseSanitizer {
  
  /**
   * Sanitize a loan object before returning via API
   * Removes all sensitive fields that should never be exposed
   */
  static sanitizeLoan<T extends Partial<Loan>>(loan: T): Omit<T, typeof SENSITIVE_LOAN_FIELDS[number]> {
    if (!loan) return loan;
    
    const sanitized = { ...loan };
    
    // Remove all sensitive fields
    for (const field of SENSITIVE_LOAN_FIELDS) {
      if (field in sanitized) {
        delete (sanitized as any)[field];
      }
    }
    
    return sanitized as Omit<T, typeof SENSITIVE_LOAN_FIELDS[number]>;
  }
  
  /**
   * Sanitize an array of loans
   */
  static sanitizeLoans<T extends Partial<Loan>>(loans: T[]): Omit<T, typeof SENSITIVE_LOAN_FIELDS[number]>[] {
    return loans.map(loan => this.sanitizeLoan(loan));
  }
  
  /**
   * Sanitize any object for logging
   * Replaces sensitive field values with [REDACTED]
   */
  static sanitizeForLogging(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeForLogging(item));
    }
    
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Check if this key contains sensitive information
      const isSensitive = LOG_SENSITIVE_FIELDS.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      );
      
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeForLogging(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  /**
   * Verify that a response does not contain sensitive fields
   * Returns true if safe to send, false if contains sensitive data
   */
  static verifyNoSensitiveData(data: any): { safe: boolean; violations: string[] } {
    const violations: string[] = [];
    
    const checkObject = (obj: any, path: string = '') => {
      if (!obj || typeof obj !== 'object') return;
      
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => checkObject(item, `${path}[${index}]`));
        return;
      }
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        // Check for sensitive field names
        for (const sensitive of SENSITIVE_LOAN_FIELDS) {
          if (key.toLowerCase() === sensitive.toLowerCase()) {
            violations.push(`Sensitive field found: ${currentPath}`);
          }
        }
        
        // Check for key-like values (hex strings of certain lengths)
        if (typeof value === 'string') {
          // Private key pattern: 64 hex chars
          if (/^[a-fA-F0-9]{64}$/.test(value) && key.toLowerCase().includes('key')) {
            violations.push(`Potential private key exposed at: ${currentPath}`);
          }
        }
        
        // Recurse into nested objects
        if (typeof value === 'object' && value !== null) {
          checkObject(value, currentPath);
        }
      }
    };
    
    checkObject(data);
    
    return {
      safe: violations.length === 0,
      violations
    };
  }
}

/**
 * Middleware to automatically sanitize loan responses
 * Can be applied to routes that return loan data
 */
export function sanitizeLoanResponse(loan: any): any {
  return ResponseSanitizer.sanitizeLoan(loan);
}

export function sanitizeLoansResponse(loans: any[]): any[] {
  return ResponseSanitizer.sanitizeLoans(loans);
}
