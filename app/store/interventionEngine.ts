import { Trade } from './trades';
import { ALL_RULES, PRO_RULES, getRulesForMode } from './rules';

// ── Stress words that indicate emotional trading ──────────────────────────────
const STRESS_WORDS = [
  'anxious', 'anxiety', 'nervous', 'scared', 'fear', 'fearful',
  'panic', 'panicking', 'stressed', 'stress', 'desperate', 'frustrated',
  'angry', 'mad', 'revenge', 'fomo', 'impulsive', 'gambling', 'chasing',
  'forced', 'random', 'bored', 'excitement', 'excited', 'greedy', 'greed',
  'emotional', 'upset', 'confused', 'unsure', 'doubt', 'doubting',
  'overtrading', 'overtrade', 'hope', 'hoping', 'praying',
];

// ── Intervention severity levels ──────────────────────────────────────────────
export type InterventionSeverity = 'warning' | 'danger' | 'critical';

export interface InterventionResult {
  shouldIntervene:    boolean;
  severity:           InterventionSeverity;
  title:              string;
  message:            string;
  reasons:            string[];
  pauseSeconds:       number;
  showRegretSimulator: boolean;
}

export interface InterventionContext {
  ruleScore:    number;
  checkedCount: number;
  totalRules:   number;
  emotions:     string;
  recentTrades: Trade[];
  session:      string;
}

// ── Detect tilt risk (consecutive losses) ─────────────────────────────────────
function detectTiltRisk(recentTrades: Trade[]): {
  isTilting:  boolean;
  lossStreak: number;
} {
  let lossStreak = 0;
  for (const t of recentTrades) {
    if (t.result === 'loss') lossStreak++;
    else break;
  }
  return { isTilting: lossStreak >= 2, lossStreak };
}

// ── Detect stress in emotional text ──────────────────────────────────────────
function detectStressWords(text: string): {
  hasStress:  boolean;
  foundWords: string[];
} {
  const lower      = text.toLowerCase();
  const foundWords = STRESS_WORDS.filter((word) => lower.includes(word));
  return { hasStress: foundWords.length > 0, foundWords };
}

// ── Detect session mismatch ───────────────────────────────────────────────────
function detectSessionMismatch(
  session:      string,
  recentTrades: Trade[]
): {
  isMismatch:     boolean;
  bestSession:    string;
  currentWinRate: number;
} {
  if (recentTrades.length < 5) {
    return { isMismatch: false, bestSession: session, currentWinRate: 100 };
  }

  const sessions     = ['London', 'New York', 'Asian', 'Overlap'];
  const sessionStats = sessions.map((s) => {
    const st     = recentTrades.filter((t) => t.session === s);
    const closed = st.filter((t) => t.result === 'win' || t.result === 'loss');
    const wins   = closed.filter((t) => t.result === 'win').length;
    const wr     = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 50;
    return { session: s, winRate: wr, count: st.length };
  }).filter((s) => s.count >= 2);

  if (sessionStats.length < 2) {
    return { isMismatch: false, bestSession: session, currentWinRate: 50 };
  }

  const best       = sessionStats.reduce((a, b) => (a.winRate > b.winRate ? a : b));
  const current    = sessionStats.find((s) => s.session === session);
  const currentWR  = current?.winRate ?? 50;
  const isMismatch =
    best.session !== session &&
    best.winRate >= 70 &&
    currentWR < 40;

  return { isMismatch, bestSession: best.session, currentWinRate: currentWR };
}

// ── Detect repeated rule violations — mode-aware ──────────────────────────────
function detectRepeatedViolations(recentTrades: Trade[]): {
  hasPattern:    boolean;
  violatedRules: { rule: string; missCount: number }[];
} {
  if (recentTrades.length < 3) {
    return { hasPattern: false, violatedRules: [] };
  }

  const last5 = recentTrades.slice(0, 5);

  // ✅ Build a Set of rules that were applicable across these trades
  // Only flag a rule if it was actually available to those trades
  const ruleApplicability = new Map<string, number>(); // rule -> how many trades had it

  last5.forEach((t) => {
    const applicableRules = getRulesForMode(t.mode ?? 'full');
    applicableRules.forEach((rule) => {
      ruleApplicability.set(rule, (ruleApplicability.get(rule) ?? 0) + 1);
    });
  });

  const violatedRules: { rule: string; missCount: number }[] = [];

  ruleApplicability.forEach((applicableCount, rule) => {
    // Only flag rules that were applicable in at least 3 of the 5 trades
    if (applicableCount < 3) return;

    const missCount = last5.filter(
      (t) => {
        const applicable = getRulesForMode(t.mode ?? 'full');
        // Only count as missed if the rule was applicable to this trade
        return applicable.includes(rule) && !t.rules.includes(rule);
      }
    ).length;

    if (missCount >= 4) {
      violatedRules.push({ rule, missCount });
    }
  });

  return {
    hasPattern:    violatedRules.length > 0,
    violatedRules: violatedRules.slice(0, 3),
  };
}

// ── Detect overtrading ────────────────────────────────────────────────────────
function detectOvertrading(recentTrades: Trade[]): {
  isOvertrading: boolean;
  todayCount:    number;
} {
  const today       = new Date();
  const todayTrades = recentTrades.filter((t) => {
    const d = new Date(t.timestamp);
    return (
      d.getDate()     === today.getDate()     &&
      d.getMonth()    === today.getMonth()    &&
      d.getFullYear() === today.getFullYear()
    );
  });
  return {
    isOvertrading: todayTrades.length >= 5,
    todayCount:    todayTrades.length,
  };
}

// ── Main intervention engine ──────────────────────────────────────────────────
export function analyzeIntervention(
  ctx: InterventionContext
): InterventionResult {
  const reasons:            string[]               = [];
  let severity:             InterventionSeverity   = 'warning';
  let pauseSeconds:         number                 = 0;
  let showRegretSimulator:  boolean                = false;

  const { ruleScore, emotions, recentTrades, session, checkedCount, totalRules } = ctx;

  // Check 1 — Very low discipline score
  if (ruleScore < 40) {
    reasons.push(`⚠️ Only ${ruleScore}% of rules followed — extremely low discipline`);
    severity            = 'critical';
    pauseSeconds        = 60;
    showRegretSimulator = true;
  } else if (ruleScore < 60) {
    reasons.push(`⚠️ Only ${ruleScore}% of rules followed — below minimum threshold`);
    severity            = 'danger';
    pauseSeconds        = 30;
    showRegretSimulator = true;
  }

  // Check 2 — Emotional stress detected
  const { hasStress, foundWords } = detectStressWords(emotions);
  if (hasStress) {
    reasons.push(`🧠 Stress detected in your notes: "${foundWords.slice(0, 2).join('", "')}"`);
    if (severity === 'warning') severity = 'danger';
    pauseSeconds        = Math.max(pauseSeconds, 30);
    showRegretSimulator = true;
  }

  // Check 3 — Tilt risk
  const { isTilting, lossStreak } = detectTiltRisk(recentTrades);
  if (isTilting) {
    reasons.push(`📉 You are on a ${lossStreak}-trade losing streak — tilt risk is high`);
    if (severity === 'warning') severity = 'danger';
    pauseSeconds        = Math.max(pauseSeconds, 45);
    showRegretSimulator = true;
  }

  // Check 4 — Session mismatch
  const { isMismatch, bestSession, currentWinRate } = detectSessionMismatch(
    session,
    recentTrades
  );
  if (isMismatch) {
    reasons.push(
      `🕐 Your ${session} session win rate is ${currentWinRate}%. Your best session is ${bestSession}`
    );
  }

  // Check 5 — Repeated rule violations (now mode-aware)
  const { hasPattern, violatedRules } = detectRepeatedViolations(recentTrades);
  if (hasPattern && violatedRules.length > 0) {
    const ruleNames = violatedRules
      .map((v) => `"${v.rule.slice(0, 30)}"`)
      .join(', ');
    reasons.push(`🔁 Pattern detected — you keep skipping: ${ruleNames}`);
  }

  // Check 6 — Overtrading
  const { isOvertrading, todayCount } = detectOvertrading(recentTrades);
  if (isOvertrading) {
    reasons.push(`⚡ You have logged ${todayCount} trades today — overtrading risk`);
    pauseSeconds = Math.max(pauseSeconds, 20);
  }

  // Check 7 — Incomplete checklist
  if (checkedCount < totalRules / 2 && checkedCount > 0) {
    reasons.push(`📋 Only ${checkedCount}/${totalRules} checklist items completed`);
  }

  const shouldIntervene = reasons.length > 0;

  if (!shouldIntervene) {
    return {
      shouldIntervene:    false,
      severity:           'warning',
      title:              '',
      message:            '',
      reasons:            [],
      pauseSeconds:       0,
      showRegretSimulator: false,
    };
  }

  let title   = '';
  let message = '';

  switch (severity) {
    case 'critical':
      title   = '🚨 CRITICAL — Stop and Review';
      message = 'Multiple risk factors detected. This trade has serious red flags. Take a forced pause before proceeding.';
      break;
    case 'danger':
      title   = '⚠️ HIGH RISK — Reconsider';
      message = 'Your current state shows risk factors that lead to bad trades. Review the warnings below carefully.';
      break;
    default:
      title   = '💡 Heads Up — Review Before Saving';
      message = 'Some patterns detected in your trading behavior. Review before confirming this trade.';
  }

  return {
    shouldIntervene,
    severity,
    title,
    message,
    reasons,
    pauseSeconds,
    showRegretSimulator,
  };
}

// ── Get rule violations for dashboard widget — mode-aware ─────────────────────
export interface RuleViolation {
  rule:        string;
  missRate:    number;
  missCount:   number;
  totalTrades: number;
}

export function getTopViolations(trades: Trade[]): RuleViolation[] {
  if (trades.length < 3) return [];

  const last20 = trades.slice(0, 20);

  // ✅ Build mode-aware rule applicability map
  // Each rule tracks how many trades it was actually applicable to
  const ruleApplicability = new Map<string, number>();

  last20.forEach((t) => {
    const applicableRules = getRulesForMode(t.mode ?? 'full');
    applicableRules.forEach((rule) => {
      ruleApplicability.set(rule, (ruleApplicability.get(rule) ?? 0) + 1);
    });
  });

  const violations: RuleViolation[] = [];

  ruleApplicability.forEach((applicableCount, rule) => {
    // Skip rules with too few applicable trades — not enough data
    if (applicableCount < 3) return;

    // Count misses only among trades where this rule was applicable
    const missCount = last20.filter((t) => {
      const applicable = getRulesForMode(t.mode ?? 'full');
      return applicable.includes(rule) && !t.rules.includes(rule);
    }).length;

    const missRate = Math.round((missCount / applicableCount) * 100);

    if (missRate >= 60) {
      violations.push({
        rule,
        missRate,
        missCount,
        totalTrades: applicableCount, // ✅ correct denominator
      });
    }
  });

  return violations
    .sort((a, b) => b.missRate - a.missRate)
    .slice(0, 5);
}