import type { Env } from '../types';
import { uid } from '../lib/crypto';
import { AppError, bad, conflict, notFound } from '../lib/http';
import { auditStmt, notifyStmt } from '../lib/notify';
import { NOW } from './sql';

export async function getBalance(env: Env, userId: string): Promise<number> {
  const r = await env.DB.prepare('SELECT balance FROM wallet_accounts WHERE user_id=?').bind(userId).first<{ balance: number }>();
  return r?.balance ?? 0;
}

/** Ledger insert that records balance_after from the *current* wallet row (call after the balance UPDATE). */
export function ledgerAfterUpdateStmt(env: Env, p: { userId: string; kind: string; amount: number; refType: string; refId: string; note: string; by: string | null }) {
  return env.DB.prepare(
    `INSERT INTO wallet_transactions(id,user_id,kind,amount,balance_after,reference_type,reference_id,note,created_by)
     SELECT ?,?,?,?,balance,?,?,?,? FROM wallet_accounts WHERE user_id=?`
  ).bind(uid(), p.userId, p.kind, p.amount, p.refType, p.refId, p.note, p.by, p.userId);
}
export function balanceDeltaStmt(env: Env, userId: string, delta: number) {
  return env.DB.prepare(`UPDATE wallet_accounts SET balance = balance + ?, updated_at = ${NOW} WHERE user_id = ?`).bind(delta, userId);
}

export async function createDeposit(env: Env, userId: string, i: { methodCode: string; amount: number; reference: string; senderName?: string; senderAccount?: string; proofKey?: string | null }) {
  const m = await env.DB.prepare('SELECT * FROM payment_methods WHERE code=?').bind(i.methodCode).first<any>();
  if (!m || !m.enabled || m.type !== 'manual') throw bad('That payment method is not available');
  if (i.amount < m.min_amount || i.amount > m.max_amount) throw bad(`Amount must be between PKR ${m.min_amount / 100} and PKR ${m.max_amount / 100}`);
  const id = uid();
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO deposits(id,user_id,method_code,amount,payment_reference,sender_name,sender_account,proof_key) VALUES(?,?,?,?,?,?,?,?)')
        .bind(id, userId, i.methodCode, i.amount, i.reference.trim(), i.senderName ?? null, i.senderAccount ?? null, i.proofKey ?? null),
      notifyStmt(env, userId, 'deposit', 'Deposit submitted', 'We are verifying your payment. Your wallet will be credited after approval.', '/dashboard/wallet'),
    ]);
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) throw conflict('That transaction ID has already been submitted for this payment method', 'duplicate_reference');
    throw e;
  }
  return id;
}

export async function approveDeposit(env: Env, depositId: string, adminId: string, ip: string | null, note?: string) {
  const d = await env.DB.prepare('SELECT * FROM deposits WHERE id=?').bind(depositId).first<any>();
  if (!d) throw notFound('Deposit not found');
  if (d.status !== 'pending') throw conflict(`Deposit is already ${d.status}`, 'already_reviewed');
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE deposits SET status='approved', reviewed_by=?, review_note=?, reviewed_at=${NOW} WHERE id=? AND status='pending'`).bind(adminId, note ?? null, depositId),
      // balance_after = old balance + amount; the unique (reference_type, reference_id, kind) makes a 2nd approval abort the whole batch
      env.DB.prepare(
        `INSERT INTO wallet_transactions(id,user_id,kind,amount,balance_after,reference_type,reference_id,note,created_by)
         SELECT ?, d.user_id, 'deposit', d.amount, w.balance + d.amount, 'deposit', d.id, ?, ? FROM deposits d JOIN wallet_accounts w ON w.user_id=d.user_id
         WHERE d.id=? AND d.status='approved' AND d.reviewed_by=?`).bind(uid(), `Deposit via ${d.method_code}`, adminId, depositId, adminId),
      env.DB.prepare(`UPDATE wallet_accounts SET balance = balance + (SELECT amount FROM deposits WHERE id=?), updated_at=${NOW} WHERE user_id=?`).bind(depositId, d.user_id),
      notifyStmt(env, d.user_id, 'deposit', 'Deposit approved', `PKR ${d.amount / 100} was added to your wallet.`, '/dashboard/wallet'),
      auditStmt(env, adminId, 'deposit.approve', 'deposit', depositId, { amount: d.amount, user: d.user_id }, ip),
    ]);
  } catch (e) {
    const cur = await env.DB.prepare('SELECT status FROM deposits WHERE id=?').bind(depositId).first<any>();
    if (cur?.status !== 'pending' || String((e as Error).message).includes('UNIQUE')) throw conflict('Deposit was already reviewed', 'already_reviewed');
    throw e;
  }
}

export async function rejectDeposit(env: Env, depositId: string, adminId: string, ip: string | null, note: string) {
  const d = await env.DB.prepare('SELECT * FROM deposits WHERE id=?').bind(depositId).first<any>();
  if (!d) throw notFound('Deposit not found');
  const [r] = await env.DB.batch([
    env.DB.prepare(`UPDATE deposits SET status='rejected', reviewed_by=?, review_note=?, reviewed_at=${NOW} WHERE id=? AND status='pending'`).bind(adminId, note, depositId),
    notifyStmt(env, d.user_id, 'deposit', 'Deposit rejected', note || 'Your payment could not be verified.', '/dashboard/wallet'),
    auditStmt(env, adminId, 'deposit.reject', 'deposit', depositId, { note }, ip),
  ]);
  if (!(r as any).meta.changes) throw conflict('Deposit was already reviewed', 'already_reviewed');
}

/** Manual adjustment (positive = credit, negative = debit). Never lets the balance go below zero. */
export async function adjustWallet(env: Env, userId: string, amount: number, note: string, adminId: string, ip: string | null) {
  if (!Number.isInteger(amount) || amount === 0) throw bad('Amount must be a non-zero whole number of paisa');
  if (!note.trim()) throw bad('A reason is required');
  const u = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first();
  if (!u) throw notFound('Customer not found');
  const refId = uid();
  try {
    await env.DB.batch([
      balanceDeltaStmt(env, userId, amount),
      ledgerAfterUpdateStmt(env, { userId, kind: 'adjustment', amount, refType: 'adjustment', refId, note, by: adminId }),
      notifyStmt(env, userId, 'wallet', amount > 0 ? 'Wallet credited' : 'Wallet debited', `${note} (PKR ${Math.abs(amount) / 100})`, '/dashboard/wallet'),
      auditStmt(env, adminId, 'wallet.adjust', 'user', userId, { amount, note }, ip),
    ]);
  } catch (e) {
    if (String((e as Error).message).includes('CHECK')) throw new AppError(409, 'insufficient_funds', 'Debit would make the balance negative');
    throw e;
  }
}
