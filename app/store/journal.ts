import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const JOURNAL_KEY  = 'tp_journal_v1';
const GOALS_KEY    = 'tp_goals_v1';
const TAGS_KEY     = 'tp_tags_v1';
const THEME_KEY    = 'tp_theme_v1';
const PIN_KEY      = 'tp_pin_v2';
const NOTIF_KEY    = 'tp_notif_settings_v1';

// ── Duress mode keys ──────────────────────────────────────────────────────────
// These are the keys used when in duress mode
// Real data stays untouched under its normal keys
const DURESS_ACTIVE_KEY  = 'tp_duress_active';   // persists across restarts
const DURESS_JOURNAL_KEY = 'tp_duress_journal_v1';
const DURESS_GOALS_KEY   = 'tp_duress_goals_v1';
const DURESS_TAGS_KEY    = 'tp_duress_tags_v1';

// ─────────────────────────────────────────────────────────────────────────────
// Duress mode persistence
// Survives app kill and relaunch
// ─────────────────────────────────────────────────────────────────────────────

export async function setDuressActive(active: boolean): Promise<void> {
  try {
    if (active) {
      await AsyncStorage.setItem(DURESS_ACTIVE_KEY, '1');
    } else {
      await AsyncStorage.removeItem(DURESS_ACTIVE_KEY);
    }
  } catch {}
}

export async function getDuressActive(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(DURESS_ACTIVE_KEY);
    return val === '1';
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Journal Entry
// ─────────────────────────────────────────────────────────────────────────────

export type Mood = 'great' | 'good' | 'neutral' | 'bad' | 'terrible';

export interface JournalEntry {
  id:        string;
  date:      string;
  dateStr:   string;
  mood:      Mood;
  note:      string;
  timestamp: string;
}

export async function loadJournal(): Promise<JournalEntry[]> {
  try {
    // In duress mode → read from duress journal key (separate empty store)
    const duress = await getDuressActive();
    const key    = duress ? DURESS_JOURNAL_KEY : JOURNAL_KEY;

    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e: any) => ({
      ...e,
      id: String(e.id),
    }));
  } catch { return []; }
}

export async function saveJournal(entries: JournalEntry[]): Promise<void> {
  try {
    // In duress mode → save to duress journal key (real data untouched)
    const duress = await getDuressActive();
    const key    = duress ? DURESS_JOURNAL_KEY : JOURNAL_KEY;
    await AsyncStorage.setItem(key, JSON.stringify(entries));
  } catch {}
}

export async function addJournalEntry(
  entry: Omit<JournalEntry, 'id'> & { id?: string | number }
): Promise<JournalEntry[]> {
  const entries = await loadJournal();
  const normalized: JournalEntry = {
    ...entry,
    id: String(entry.id ?? Date.now()),
  };
  const existing = entries.findIndex((e) => e.date === normalized.date);
  let updated: JournalEntry[];
  if (existing >= 0) {
    updated = entries.map((e, i) => (i === existing ? normalized : e));
  } else {
    updated = [normalized, ...entries];
  }
  await saveJournal(updated);
  return updated;
}

export async function deleteJournalEntry(
  id: string | number
): Promise<JournalEntry[]> {
  const entries = await loadJournal();
  const updated = entries.filter((e) => String(e.id) !== String(id));
  await saveJournal(updated);
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Goals
// ─────────────────────────────────────────────────────────────────────────────

export interface Goals {
  monthlyPnl:     number;
  winRate:        number;
  discipline:     number;
  tradesPerMonth: number;
}

const DEFAULT_GOALS: Goals = {
  monthlyPnl:     1000,
  winRate:        60,
  discipline:     80,
  tradesPerMonth: 20,
};

export async function loadGoals(): Promise<Goals> {
  try {
    // In duress mode → return default goals (looks fresh/empty)
    const duress = await getDuressActive();
    const key    = duress ? DURESS_GOALS_KEY : GOALS_KEY;

    const raw = await AsyncStorage.getItem(key);
    if (!raw) return DEFAULT_GOALS;
    return { ...DEFAULT_GOALS, ...JSON.parse(raw) };
  } catch { return DEFAULT_GOALS; }
}

export async function saveGoals(goals: Goals): Promise<void> {
  try {
    // In duress mode → save to duress goals key
    const duress = await getDuressActive();
    const key    = duress ? DURESS_GOALS_KEY : GOALS_KEY;
    await AsyncStorage.setItem(key, JSON.stringify(goals));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Tags
// ─────────────────────────────────────────────────────────────────────────────

export interface TradeTag {
  id:    string;
  label: string;
  color: string;
}

const DEFAULT_TAGS: TradeTag[] = [
  { id: '1', label: 'Revenge Trade', color: '#ff6b6b' },
  { id: '2', label: 'FOMO',          color: '#ffd166' },
  { id: '3', label: 'Perfect Setup', color: '#00d68f' },
  { id: '4', label: 'Overtrading',   color: '#ff6b6b' },
  { id: '5', label: 'Patient Entry', color: '#00d68f' },
  { id: '6', label: 'News Trade',    color: '#4fc3f7' },
  { id: '7', label: 'Scalp',         color: '#a78bfa' },
  { id: '8', label: 'Swing',         color: '#4fc3f7' },
];

export async function loadTags(): Promise<TradeTag[]> {
  try {
    // Tags are non-sensitive — same in both modes
    // But we still isolate them for consistency
    const duress = await getDuressActive();
    const key    = duress ? DURESS_TAGS_KEY : TAGS_KEY;

    const raw = await AsyncStorage.getItem(key);
    if (!raw) return DEFAULT_TAGS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_TAGS;
  } catch { return DEFAULT_TAGS; }
}

export async function saveTags(tags: TradeTag[]): Promise<void> {
  try {
    const duress = await getDuressActive();
    const key    = duress ? DURESS_TAGS_KEY : TAGS_KEY;
    await AsyncStorage.setItem(key, JSON.stringify(tags));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme Accent
// Theme is NOT duress-aware — same theme in both modes (no leak)
// ─────────────────────────────────────────────────────────────────────────────

export type AccentColor = 'green' | 'blue' | 'purple' | 'amber' | 'red';

export interface ThemeSettings {
  accent: AccentColor;
}

const DEFAULT_THEME: ThemeSettings = { accent: 'green' };

export async function loadTheme(): Promise<ThemeSettings> {
  try {
    const raw = await AsyncStorage.getItem(THEME_KEY);
    if (!raw) return DEFAULT_THEME;
    return { ...DEFAULT_THEME, ...JSON.parse(raw) };
  } catch { return DEFAULT_THEME; }
}

export async function saveTheme(theme: ThemeSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// PIN — Hashed Storage with Duress PIN Support
// ─────────────────────────────────────────────────────────────────────────────

export interface PinData {
  hash:        string;        // SHA-256 hash of the real PIN
  duressHash:  string | null; // SHA-256 hash of the duress PIN (null = not set)
  biometrics:  boolean;       // whether biometrics unlock is enabled
  lockedUntil: number;        // unix timestamp when lockout expires (0 = not locked)
  attempts:    number;        // consecutive wrong attempt count
}

const MAX_ATTEMPTS = 5;

const LOCKOUT_DURATIONS = [
  30_000,
  60_000,
  300_000,
  900_000,
  3_600_000,
];

// ── Hash a PIN string ─────────────────────────────────────────────────────────
export async function hashPin(pin: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin + 'tp_salt_2025'
  );
}

// ── Load raw PinData ──────────────────────────────────────────────────────────
export async function loadPinData(): Promise<PinData | null> {
  try {
    const raw = await AsyncStorage.getItem(PIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PinData;
    // Normalize — old records won't have duressHash
    return {
      ...parsed,
      duressHash: parsed.duressHash ?? null,
    };
  } catch { return null; }
}

// ── Save raw PinData ──────────────────────────────────────────────────────────
async function savePinData(data: PinData | null): Promise<void> {
  try {
    if (data === null) {
      await AsyncStorage.removeItem(PIN_KEY);
    } else {
      await AsyncStorage.setItem(PIN_KEY, JSON.stringify(data));
    }
  } catch {}
}

// ── Check if a PIN is set ─────────────────────────────────────────────────────
export async function loadPin(): Promise<string | null> {
  const data = await loadPinData();
  return data ? 'SET' : null;
}

// ── Save a new real PIN ───────────────────────────────────────────────────────
export async function savePin(pin: string | null): Promise<void> {
  if (pin === null) {
    // Remove PIN entirely — also clear duress hash and duress mode
    await savePinData(null);
    await setDuressActive(false);
    return;
  }

  const existingData = await loadPinData();
  const hash         = await hashPin(pin);

  await savePinData({
    hash,
    duressHash:  existingData?.duressHash  ?? null,
    biometrics:  existingData?.biometrics  ?? false,
    lockedUntil: 0,
    attempts:    0,
  });
}

// ── Save a duress PIN ─────────────────────────────────────────────────────────
// Returns false if the duress PIN matches the real PIN (not allowed)
export async function saveDuressPin(pin: string | null): Promise<boolean> {
  const data = await loadPinData();
  if (!data) return false; // must have a real PIN first

  if (pin === null) {
    // Remove duress PIN
    await savePinData({ ...data, duressHash: null });
    return true;
  }

  // Safety check — duress PIN must not equal real PIN
  const duressHash = await hashPin(pin);
  if (duressHash === data.hash) {
    return false; // caller must show error
  }

  await savePinData({ ...data, duressHash });
  return true;
}

// ── Check if a duress PIN is set ──────────────────────────────────────────────
export async function isDuressPinSet(): Promise<boolean> {
  const data = await loadPinData();
  return !!data?.duressHash;
}

// ── Verify a PIN attempt ──────────────────────────────────────────────────────
export interface VerifyResult {
  success:       boolean;
  isDuress:      boolean;  // ← true if the entered PIN was the duress PIN
  locked:        boolean;
  lockedUntil:   number;
  attemptsLeft:  number;
  totalAttempts: number;
}

export async function verifyPin(entered: string): Promise<VerifyResult> {
  const data = await loadPinData();

  if (!data) {
    return {
      success:       false,
      isDuress:      false,
      locked:        false,
      lockedUntil:   0,
      attemptsLeft:  MAX_ATTEMPTS,
      totalAttempts: 0,
    };
  }

  // ── Check if currently locked out ────────────────────────────────────────
  const now = Date.now();
  if (data.lockedUntil > now) {
    return {
      success:       false,
      isDuress:      false,
      locked:        true,
      lockedUntil:   data.lockedUntil,
      attemptsLeft:  0,
      totalAttempts: data.attempts,
    };
  }

  const enteredHash = await hashPin(entered);

  // ── Check real PIN ────────────────────────────────────────────────────────
  if (enteredHash === data.hash) {
    // Real PIN — reset attempts, clear duress mode
    await savePinData({ ...data, attempts: 0, lockedUntil: 0 });
    await setDuressActive(false); // exit duress if was in it

    return {
      success:       true,
      isDuress:      false,
      locked:        false,
      lockedUntil:   0,
      attemptsLeft:  MAX_ATTEMPTS,
      totalAttempts: 0,
    };
  }

  // ── Check duress PIN ──────────────────────────────────────────────────────
  if (data.duressHash && enteredHash === data.duressHash) {
    // Duress PIN — do NOT reset attempts (no security signal to attacker)
    // Activate duress mode persistently
    await setDuressActive(true);

    return {
      success:       true,
      isDuress:      true,  // caller will set isDuress context flag
      locked:        false,
      lockedUntil:   0,
      attemptsLeft:  MAX_ATTEMPTS,
      totalAttempts: data.attempts,
    };
  }

  // ── Wrong PIN ─────────────────────────────────────────────────────────────
  const newAttempts    = data.attempts + 1;
  let   newLockedUntil = 0;

  if (newAttempts > MAX_ATTEMPTS) {
    const lockoutIndex = Math.min(
      newAttempts - MAX_ATTEMPTS - 1,
      LOCKOUT_DURATIONS.length - 1
    );
    newLockedUntil = now + LOCKOUT_DURATIONS[lockoutIndex];
  }

  await savePinData({
    ...data,
    attempts:    newAttempts,
    lockedUntil: newLockedUntil,
  });

  return {
    success:       false,
    isDuress:      false,
    locked:        newLockedUntil > 0,
    lockedUntil:   newLockedUntil,
    attemptsLeft:  Math.max(0, MAX_ATTEMPTS - newAttempts),
    totalAttempts: newAttempts,
  };
}

// ── Reset lockout ─────────────────────────────────────────────────────────────
export async function resetLockout(): Promise<void> {
  const data = await loadPinData();
  if (!data) return;
  await savePinData({ ...data, attempts: 0, lockedUntil: 0 });
}

// ── Biometrics setting ────────────────────────────────────────────────────────
// Biometrics always unlocks real mode — never duress
export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  const data = await loadPinData();
  if (!data) return;
  await savePinData({ ...data, biometrics: enabled });
}

export async function isBiometricsEnabled(): Promise<boolean> {
  const data = await loadPinData();
  return data?.biometrics ?? false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification Settings
// ─────────────────────────────────────────────────────────────────────────────

export interface NotifSettings {
  dailyReminder: boolean;
  weeklyReview:  boolean;
}

const DEFAULT_NOTIF: NotifSettings = {
  dailyReminder: false,
  weeklyReview:  false,
};

export async function loadNotifSettings(): Promise<NotifSettings> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_KEY);
    if (!raw) return DEFAULT_NOTIF;
    return { ...DEFAULT_NOTIF, ...JSON.parse(raw) };
  } catch { return DEFAULT_NOTIF; }
}

export async function saveNotifSettings(
  settings: NotifSettings
): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(settings));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily Quotes
// ─────────────────────────────────────────────────────────────────────────────

export const TRADING_QUOTES = [
  {
    text:   'The goal of a successful trader is to make the best trades. Money is secondary.',
    author: 'Alexander Elder',
  },
  {
    text:   "It's not whether you're right or wrong that's important, but how much money you make when you're right.",
    author: 'George Soros',
  },
  {
    text:   "Risk comes from not knowing what you're doing.",
    author: 'Warren Buffett',
  },
  {
    text:   'The stock market is filled with individuals who know the price of everything, but the value of nothing.',
    author: 'Philip Fisher',
  },
  {
    text:   'In trading, the man who can handle the losses is the one who will survive.',
    author: 'Jesse Livermore',
  },
  {
    text:   'The elements of good trading are cutting losses, cutting losses, and cutting losses.',
    author: 'Ed Seykota',
  },
  {
    text:   'I always define my risk, and I do not have to worry about it.',
    author: 'Tony Saliba',
  },
  {
    text:   'The key to trading success is emotional discipline. Making money has nothing to do with intelligence.',
    author: 'Victor Sperandeo',
  },
  {
    text:   'The most important quality for an investor is temperament, not intellect.',
    author: 'Warren Buffett',
  },
  {
    text:   'Do not focus on making money; focus on protecting what you have.',
    author: 'Paul Tudor Jones',
  },
  {
    text:   'Plan the trade, trade the plan.',
    author: 'Unknown',
  },
  {
    text:   'Every battle is won before it is fought.',
    author: 'Sun Tzu',
  },
  {
    text:   'Patience is not the ability to wait, but the ability to keep a good attitude while waiting.',
    author: 'Joyce Meyer',
  },
  {
    text:   'Amateurs think about how much money they can make. Professionals think about how much money they could lose.',
    author: 'Jack Schwager',
  },
  {
    text:   'I do not chase money. I execute my system.',
    author: 'Trade Protocol',
  },
  {
    text:   'Your system is only as good as your discipline to follow it.',
    author: 'Trade Protocol',
  },
  {
    text:   'The trade you do not take is sometimes your best trade.',
    author: 'Trade Protocol',
  },
  {
    text:   'Consistency beats perfection every single day.',
    author: 'Trade Protocol',
  },
  {
    text:   'A loss is just data. Learn from it and move forward.',
    author: 'Trade Protocol',
  },
  {
    text:   'Protect your capital. It is your most valuable trading tool.',
    author: 'Trade Protocol',
  },
];

export function getTodayQuote(): (typeof TRADING_QUOTES)[0] {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
      86400000
  );
  return TRADING_QUOTES[dayOfYear % TRADING_QUOTES.length];
}