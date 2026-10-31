// ─────────────────────────────────────────────────────────────────────────────
// Full Mode Rules — 25 rules across 3 phases
// Single source of truth — must stay in sync with log.tsx rule groups
// ─────────────────────────────────────────────────────────────────────────────

// BEFORE — Market Check (3)
const BEFORE_MARKET = [
  'Trend identified (up/down/range)',
  'Trading with trend or valid setup',
  'Price at key zone (S/R or supply-demand)',
];

// BEFORE — Setup Confirmation (3)
const BEFORE_SETUP = [
  'Clear setup - not guessing',
  'Confirmation present (rejection, structure break)',
  'Trade based on system - not feelings',
];

// BEFORE — Risk Control (4)
const BEFORE_RISK = [
  'Lot size calculated correctly',
  'Risk is fixed and defined',
  'SL placed at a logical level',
  'TP realistic (minimum 1:2 RR)',
];

// BEFORE — Mental Check (2)
const BEFORE_MENTAL = [
  'Was calm before entry',
  'Okay with losing this trade',
];

// DURING — I Did NOT (5)
const DURING_NOT = [
  'Did not move SL',
  'Did not move TP',
  'Did not close early out of fear',
  'Did not watch every tick emotionally',
  'Did not add to a losing position',
];

// DURING — I Did (3)
const DURING_DID = [
  'Let the trade play out fully',
  'Accepted the outcome',
  'Stayed calm throughout',
];

// AFTER — Trade Review (4)
const AFTER_TRADE = [
  'Followed my rules',
  'Entry was valid',
  'SL was placed correctly',
  'TP was logical',
];

// ─────────────────────────────────────────────────────────────────────────────
// Full Mode — 25 rules total
// 3 + 3 + 4 + 2 + 5 + 3 + 4 = 25
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_RULES: string[] = [
  ...BEFORE_MARKET,   // 3
  ...BEFORE_SETUP,    // 3
  ...BEFORE_RISK,     // 4
  ...BEFORE_MENTAL,   // 2
  ...DURING_NOT,      // 5
  ...DURING_DID,      // 3
  ...AFTER_TRADE,     // 4
];                    // = 25

// ─────────────────────────────────────────────────────────────────────────────
// Full Mode — Phase slices
// ─────────────────────────────────────────────────────────────────────────────

export const BEFORE_RULES = ALL_RULES.slice(0, 12);   // 3+3+4+2 = 12
export const DURING_RULES = ALL_RULES.slice(12, 20);  // 5+3     = 8
export const AFTER_RULES  = ALL_RULES.slice(20, 25);  // 4       = 4

// ─────────────────────────────────────────────────────────────────────────────
// Pro Mode Rules — 10 core non-negotiable rules
// Must stay in sync with ALL_RULES_PRO in app/log.tsx
// ─────────────────────────────────────────────────────────────────────────────

export const PRO_RULES: string[] = [
  // BEFORE ENTRY — 8 rules
  'Trend identified (up/down/range)',
  'Price at key zone (S/R or supply-demand)',
  'Clear setup - not guessing',
  'Confirmation present (rejection, structure break)',
  'Lot size calculated correctly',
  'Risk is fixed and defined',
  'SL placed at a logical level',
  'Was calm before entry',
  // DURING — 1 rule
  'Did not move SL',
  // AFTER — 1 rule
  'Followed my rules',
];

// ─────────────────────────────────────────────────────────────────────────────
// Utility — check if a rule belongs to pro mode
// ─────────────────────────────────────────────────────────────────────────────

export function isProRule(rule: string): boolean {
  return PRO_RULES.includes(rule);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility — get applicable rules for a given trade mode
// Used by DisciplineTrendScreen for mode-aware compliance
// ─────────────────────────────────────────────────────────────────────────────

export function getRulesForMode(mode: 'pro' | 'full' | undefined): string[] {
  if (mode === 'pro')  return PRO_RULES;
  if (mode === 'full') return ALL_RULES;
  // Legacy trades with no mode field — default to ALL_RULES
  return ALL_RULES;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility — get all unique rules across both modes
// Used to build the unified compliance breakdown
// ─────────────────────────────────────────────────────────────────────────────

export function getAllUniqueRules(): string[] {
  return Array.from(new Set([...ALL_RULES, ...PRO_RULES]));
}