/**
 * fraudDetection.ts — Anti-fraud signals for Stripe PaymentIntent checkout.
 *
 * Two responsibilities:
 *  1. evaluateFraudSignals — reads Stripe Charge outcome + order quantities,
 *     returns a verdict: blocked (hard reject) or reviewRequired (soft flag).
 *  2. logFraudAttempt — persists suspicious signals to the fraud_logs table
 *     for later admin review.
 *
 * Only called from confirm-payment-intent.ts (server-side, after Stripe confirms).
 */

import type Stripe from 'stripe';
import { supabaseAdmin } from '../supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FraudSignals {
    /** Stripe outcome.risk_level: 'normal' | 'elevated' | 'highest' | '' */
    riskLevel:      string;
    /** Stripe outcome.type: 'authorized' | 'manual_review' | 'blocked' | ... */
    outcomeType:    string;
    /** Stripe outcome.seller_message — human-readable reason */
    sellerMessage:  string;
    /** Hard block: do not capture, cancel the PaymentIntent */
    blocked:        boolean;
    /** Soft flag: capture but mark order for manual review */
    reviewRequired: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Stripe risk levels that must be hard-blocked */
const BLOCKED_RISK_LEVELS = new Set(['highest']);

/** Stripe outcome types that must be hard-blocked */
const BLOCKED_OUTCOME_TYPES = new Set(['blocked']);

/** Quantity thresholds that trigger a soft review flag */
const REVIEW_MAX_SINGLE_ITEM_QTY = 10;
const REVIEW_MAX_TOTAL_QTY       = 20;

// ── evaluateFraudSignals ──────────────────────────────────────────────────────

/**
 * Evaluate fraud signals from a retrieved Stripe PaymentIntent.
 *
 * The PaymentIntent must have been retrieved with `expand: ['latest_charge']`
 * so that `outcome` data is available.
 */
export function evaluateFraudSignals(
    paymentIntent: Stripe.PaymentIntent,
    items: Array<{ quantity: number }>,
): FraudSignals {
    // Prefer `latest_charge` (Stripe API v2024+); fall back to deprecated `charges.data[0]`
    const charge  = (paymentIntent.latest_charge as Stripe.Charge | null | undefined)
                 ?? ((paymentIntent as any).charges?.data?.[0] as Stripe.Charge | undefined);

    const outcome      = charge?.outcome;
    const riskLevel    = (outcome?.risk_level    ?? '') as string;
    const outcomeType  = (outcome?.type          ?? '') as string;
    const sellerMessage = (outcome?.seller_message ?? '') as string;

    // Hard block: Stripe explicitly flags this as highest risk or blocked
    const blocked = BLOCKED_RISK_LEVELS.has(riskLevel) || BLOCKED_OUTCOME_TYPES.has(outcomeType);

    // Soft flag: elevated risk OR abnormal quantities
    const totalQty     = items.reduce((sum, i) => sum + Math.max(0, Number(i.quantity)), 0);
    const maxSingleQty = items.reduce((max, i) => Math.max(max, Number(i.quantity)), 0);
    const highQuantity = totalQty > REVIEW_MAX_TOTAL_QTY || maxSingleQty > REVIEW_MAX_SINGLE_ITEM_QTY;

    const reviewRequired =
        !blocked &&
        (riskLevel === 'elevated' || outcomeType === 'manual_review' || highQuantity);

    return { riskLevel, outcomeType, sellerMessage, blocked, reviewRequired };
}

// ── logFraudAttempt ───────────────────────────────────────────────────────────

/**
 * Write a record to fraud_logs. Called for every blocked attempt.
 * Errors are swallowed (non-critical path); failures are logged to console only.
 */
export async function logFraudAttempt(params: {
    userId:           string | null;
    ipAddress:        string;
    paymentIntentId:  string;
    riskLevel:        string;
    outcomeType:      string;
    sellerMessage:    string;
}): Promise<void> {
    const { error } = await supabaseAdmin
        .from('fraud_logs')
        .insert({
            user_id:           params.userId           || null,
            ip_address:        params.ipAddress,
            payment_intent_id: params.paymentIntentId,
            risk_level:        params.riskLevel        || null,
            outcome_type:      params.outcomeType      || null,
            details: {
                seller_message: params.sellerMessage,
                timestamp:      new Date().toISOString(),
            },
        });

    if (error) {
        // Non-critical: always log to console even if DB insert fails
        console.error('[fraud] Failed to persist fraud log:', error.message);
    }
}
