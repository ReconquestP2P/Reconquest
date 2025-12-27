/**
 * Dispute Resolution Service
 * 
 * Implements deterministic dispute resolution using pre-signed transactions.
 * Admin selects from a finite set of decisions, each mapping to a specific
 * pre-signed transaction template. Platform signs and broadcasts.
 */

import * as tinysecp from 'tiny-secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { generateTestnet4Multisig, sortPublicKeysBIP67 } from './testnet4-deterministic-keys.js';
import { TESTNET4_CONFIG } from './testnet4-config.js';
import { 
  type Loan, 
  type Dispute,
  type DisputeDecision,
  DECISION_TO_TX_FIELD,
  type InsertDisputeAuditLog 
} from '@shared/schema';
import { storage } from '../storage.js';

// Helper functions
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function reverseHex(hex: string): string {
  const bytes = hexToBytes(hex);
  return bytesToHex(bytes.reverse());
}

function encodeVarInt(n: number): Uint8Array {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
  throw new Error('VarInt too large');
}

function int32ToLE(n: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = n & 0xff;
  buf[1] = (n >> 8) & 0xff;
  buf[2] = (n >> 16) & 0xff;
  buf[3] = (n >> 24) & 0xff;
  return buf;
}

function int64ToLE(n: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    buf[i] = Number((n >> BigInt(i * 8)) & BigInt(0xff));
  }
  return buf;
}

/**
 * Convert compact r,s bytes to DER format
 */
function compactToDER(r: Uint8Array, s: Uint8Array): Uint8Array {
  let rTrimmed = trimLeadingZeros(r);
  let sTrimmed = trimLeadingZeros(s);
  
  if (rTrimmed[0] >= 0x80) {
    const padded = new Uint8Array(rTrimmed.length + 1);
    padded[0] = 0;
    padded.set(rTrimmed, 1);
    rTrimmed = padded;
  }
  if (sTrimmed[0] >= 0x80) {
    const padded = new Uint8Array(sTrimmed.length + 1);
    padded[0] = 0;
    padded.set(sTrimmed, 1);
    sTrimmed = padded;
  }
  
  const totalLen = 2 + rTrimmed.length + 2 + sTrimmed.length;
  const der = new Uint8Array(2 + totalLen);
  
  let offset = 0;
  der[offset++] = 0x30;
  der[offset++] = totalLen;
  der[offset++] = 0x02;
  der[offset++] = rTrimmed.length;
  der.set(rTrimmed, offset);
  offset += rTrimmed.length;
  der[offset++] = 0x02;
  der[offset++] = sTrimmed.length;
  der.set(sTrimmed, offset);
  
  return der;
}

function trimLeadingZeros(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytes.slice(i);
}

/**
 * Sign with tiny-secp256k1 and append SIGHASH_ALL byte
 */
function signWithSighashAll(privateKeyHex: string, sighash: Uint8Array): Uint8Array {
  const privateKey = hexToBytes(privateKeyHex);
  
  const compactSig = tinysecp.sign(sighash, privateKey);
  if (!compactSig) {
    throw new Error('Failed to sign with tiny-secp256k1');
  }
  
  const r = compactSig.slice(0, 32);
  const s = compactSig.slice(32, 64);
  
  const derSig = compactToDER(r, s);
  
  const sigWithHashType = new Uint8Array(derSig.length + 1);
  sigWithHashType.set(derSig);
  sigWithHashType[derSig.length] = 0x01;
  
  return sigWithHashType;
}

/**
 * Create BIP-143 sighash for P2WSH spending
 */
function createBIP143Sighash(
  txVersion: number,
  prevouts: { txid: string; vout: number }[],
  sequences: number[],
  inputIndex: number,
  witnessScript: Uint8Array,
  amount: bigint,
  outputs: { script: Uint8Array; value: bigint }[],
  locktime: number,
  sighashType: number = 0x01
): Uint8Array {
  const nVersion = int32ToLE(txVersion);
  
  const prevoutsData: number[] = [];
  for (const p of prevouts) {
    prevoutsData.push(...hexToBytes(reverseHex(p.txid)));
    prevoutsData.push(...int32ToLE(p.vout));
  }
  const hashPrevouts = sha256(sha256(new Uint8Array(prevoutsData)));
  
  const seqData: number[] = [];
  for (const s of sequences) {
    seqData.push(...int32ToLE(s));
  }
  const hashSequence = sha256(sha256(new Uint8Array(seqData)));
  
  const outpoint = new Uint8Array([
    ...hexToBytes(reverseHex(prevouts[inputIndex].txid)),
    ...int32ToLE(prevouts[inputIndex].vout),
  ]);
  
  const scriptCode = new Uint8Array([
    ...encodeVarInt(witnessScript.length),
    ...witnessScript,
  ]);
  
  const valueBytes = int64ToLE(amount);
  const nSequence = int32ToLE(sequences[inputIndex]);
  
  const outputsData: number[] = [];
  for (const o of outputs) {
    outputsData.push(...int64ToLE(o.value));
    outputsData.push(...encodeVarInt(o.script.length));
    outputsData.push(...o.script);
  }
  const hashOutputs = sha256(sha256(new Uint8Array(outputsData)));
  
  const nLocktime = int32ToLE(locktime);
  const sighashBytes = int32ToLE(sighashType);
  
  const preimage = new Uint8Array([
    ...nVersion,
    ...hashPrevouts,
    ...hashSequence,
    ...outpoint,
    ...scriptCode,
    ...valueBytes,
    ...nSequence,
    ...hashOutputs,
    ...nLocktime,
    ...sighashBytes,
  ]);
  
  return sha256(sha256(preimage));
}

/**
 * Broadcast transaction to Testnet4
 */
async function broadcastTransaction(txHex: string): Promise<string> {
  const url = TESTNET4_CONFIG.api.broadcastTx;
  console.log(`[DisputeResolution] Broadcasting to: ${url}`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: txHex,
  });
  
  const result = await response.text();
  
  if (!response.ok) {
    throw new Error(`Broadcast failed: ${result}`);
  }
  
  return result;
}

export interface DisputeResolutionResult {
  success: boolean;
  txid?: string;
  decision: DisputeDecision;
  error?: string;
  auditLogId?: number;
}

/**
 * Resolve a dispute by signing and broadcasting the appropriate pre-signed transaction
 */
export async function resolveDispute(
  loanId: number,
  decision: DisputeDecision,
  adminUserId: number,
  adminNotes?: string
): Promise<DisputeResolutionResult> {
  console.log(`[DisputeResolution] Starting resolution for loan ${loanId} with decision: ${decision}`);
  
  // 1. Fetch the loan
  const loan = await storage.getLoan(loanId);
  if (!loan) {
    return { success: false, decision, error: 'Loan not found' };
  }
  
  // 2. Verify loan is in dispute status
  if (loan.disputeStatus !== 'under_review') {
    return { 
      success: false, 
      decision, 
      error: `Loan dispute status must be 'under_review', got: ${loan.disputeStatus}` 
    };
  }
  
  // 3. Get the transaction field for this decision
  const txField = DECISION_TO_TX_FIELD[decision];
  const txHex = loan[txField] as string | null;
  
  if (!txHex) {
    return { 
      success: false, 
      decision, 
      error: `No pre-signed transaction found for decision ${decision} (field: ${txField})` 
    };
  }
  
  // 4. Get platform key for signing
  const multisig = generateTestnet4Multisig();
  const platformPrivateKey = multisig.keypairs.platform.privateKeyHex;
  
  // 5. Parse the pre-signed transaction to extract components
  // The pre-signed tx should already have borrower+lender signatures
  // Platform adds the third signature to complete 2-of-3
  
  // For now, we'll attempt to broadcast the pre-signed tx as-is
  // In a full implementation, we'd parse the PSBT and add platform signature
  
  let broadcastTxid: string | undefined;
  let broadcastSuccess = false;
  let broadcastError: string | undefined;
  
  try {
    // Attempt broadcast
    broadcastTxid = await broadcastTransaction(txHex);
    broadcastSuccess = true;
    console.log(`[DisputeResolution] Broadcast successful: ${broadcastTxid}`);
  } catch (err) {
    broadcastError = err instanceof Error ? err.message : String(err);
    console.error(`[DisputeResolution] Broadcast failed:`, broadcastError);
  }
  
  // Get active dispute for audit log
  const disputes = await storage.getDisputesByLoan(loanId);
  const activeDispute = disputes.find(d => d.status === 'under_review' || d.status === 'open');
  
  // Determine what the final state will be
  let finalLoanStatus = loan.status;
  let finalDisputeStatus = loan.disputeStatus;
  
  // 6. Only update loan/dispute status if broadcast succeeded
  if (broadcastSuccess) {
    const loanUpdates: Partial<Loan> = {
      disputeStatus: 'resolved',
      disputeResolvedAt: new Date(),
    };
    
    // Set loan status based on decision
    if (decision === 'BORROWER_NOT_DEFAULTED') {
      loanUpdates.status = 'completed';
    } else if (decision === 'BORROWER_DEFAULTED' || decision === 'TIMEOUT_DEFAULT') {
      loanUpdates.status = 'defaulted';
    }
    
    await storage.updateLoan(loanId, loanUpdates);
    
    // Re-read the loan from storage to get the actual persisted state
    const updatedLoan = await storage.getLoan(loanId);
    if (updatedLoan) {
      finalLoanStatus = updatedLoan.status;
      finalDisputeStatus = updatedLoan.disputeStatus || 'resolved';
    }
    
    // Update the dispute record and capture the returned updated dispute
    if (activeDispute) {
      const updatedDispute = await storage.updateDispute(activeDispute.id, {
        status: 'resolved',
        resolution: `${decision}${adminNotes ? `: ${adminNotes}` : ''}`,
        broadcastTxid: broadcastTxid || null,
        resolvedAt: new Date(),
      });
      // Use the actual persisted dispute for audit log accuracy
      if (updatedDispute) {
        Object.assign(activeDispute, updatedDispute);
      }
    }
  }
  // If broadcast failed, leave loan/dispute in under_review status for retry
  
  // 7. Create audit log entry (after updates, with final state)
  const auditLog: InsertDisputeAuditLog = {
    loanId,
    disputeId: activeDispute?.id || null,
    outcome: decision,
    ruleFired: `ADMIN_DECISION_${decision}`,
    txTypeUsed: txField.replace('tx', '').replace('Hex', '').toLowerCase(),
    evidenceSnapshot: JSON.stringify({
      decision,
      adminNotes,
      loanStatusBefore: loan.status,
      loanStatusAfter: finalLoanStatus,
      disputeStatusBefore: loan.disputeStatus,
      disputeStatusAfter: finalDisputeStatus,
      timestamp: new Date().toISOString(),
    }),
    broadcastTxid: broadcastTxid || null,
    broadcastSuccess,
    broadcastError: broadcastError || null,
    triggeredBy: adminUserId,
    triggeredByRole: 'admin',
  };
  
  const createdLog = await storage.createDisputeAuditLog(auditLog);
  
  return {
    success: broadcastSuccess,
    txid: broadcastTxid,
    decision,
    error: broadcastError,
    auditLogId: createdLog.id,
  };
}

/**
 * Get all loans with disputes under review
 */
export async function getDisputesUnderReview(): Promise<(Loan & { dispute?: Dispute })[]> {
  const allLoans = await storage.getAllLoans();
  const loansUnderReview = allLoans.filter(l => l.disputeStatus === 'under_review');
  
  // Attach dispute records
  const results: (Loan & { dispute?: Dispute })[] = [];
  
  for (const loan of loansUnderReview) {
    const disputes = await storage.getDisputesByLoan(loan.id);
    const activeDispute = disputes.find(d => d.status === 'under_review' || d.status === 'open');
    results.push({ ...loan, dispute: activeDispute });
  }
  
  return results;
}

/**
 * Manually set a loan to under_review status (for testing)
 */
export async function setLoanUnderReview(loanId: number): Promise<Loan | undefined> {
  return storage.updateLoan(loanId, { disputeStatus: 'under_review' });
}
