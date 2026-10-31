import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Directory, Paths } from 'expo-file-system';
import { getDuressActive } from './journal';

// ── Real data keys ────────────────────────────────────────────────────────────
const STORAGE_KEY    = 'eric_trades_v1';
const GALLERY_KEY    = 'eric_gallery_v1';
const MENTAL_LOG_KEY = 'eric_mental_log_v1';
const NOTES_KEY      = 'eric_notes_v1';

// ── Duress data keys ──────────────────────────────────────────────────────────
const DURESS_TRADES_KEY      = 'tp_duress_trades_v1';
const DURESS_GALLERY_KEY     = 'tp_duress_gallery_v1';
const DURESS_MENTAL_LOG_KEY  = 'tp_duress_mental_log_v1';
const DURESS_NOTES_KEY       = 'tp_duress_notes_v1';

// ─────────────────────────────────────────────────────────────────────────────
// Helper — pick the right key based on duress mode
// ─────────────────────────────────────────────────────────────────────────────

async function tradesKey():  Promise<string> { return (await getDuressActive()) ? DURESS_TRADES_KEY     : STORAGE_KEY;    }
async function galleryKey(): Promise<string> { return (await getDuressActive()) ? DURESS_GALLERY_KEY    : GALLERY_KEY;    }
async function mentalKey():  Promise<string> { return (await getDuressActive()) ? DURESS_MENTAL_LOG_KEY : MENTAL_LOG_KEY; }
async function notesKey():   Promise<string> { return (await getDuressActive()) ? DURESS_NOTES_KEY      : NOTES_KEY;      }

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface Trade {
  id:         number;
  pair:       string;
  dir:        'BUY' | 'SELL';
  entry:      string;
  lot:        string;
  sl:         string;
  tp:         string;
  pnl:        number;
  session:    string;
  result:     'win' | 'loss' | 'be' | 'open';
  strategy:   string;
  timeframe:  string;
  mode:       'pro' | 'full';
  rules:      string[];
  ruleScore:  number;
  emotions:   string;
  mistakes:   string;
  lesson:     string;
  setup:      string;
  timestamp:  string;
  dateStr:    string;
  timeStr:    string;
  tags:       string[];
}

// ── UPDATED: includes group fields ────────────────────────────────────────────
export interface GalleryImage {
  id:          number;
  uri:         string;
  title:       string;
  notes:       string;
  category:    'pattern' | 'setup' | 'analysis' | 'mistake' | 'other';
  tradeId:     number | null;
  tradePair:   string | null;
  timestamp:   string;
  dateStr:     string;
  groupId?:    string | null;
  groupName?:  string | null;
  groupOrder?: number;
}

export interface MentalLog {
  id:         string;
  date:       string;
  dateStr:    string;
  mood:       'focused' | 'neutral' | 'anxious' | 'frustrated' | 'tired' | 'confident';
  bias:       'bullish' | 'bearish' | 'neutral';
  focusLevel: number;
  patience:   number;
  confidence: number;
  intention:  string;
  reflection: string;
  timestamp:  string;
}

export interface ChecklistItem {
  id:      number;
  text:    string;
  checked: boolean;
}

export interface Note {
  id:        number;
  title:     string;
  content:   string;
  checklist: ChecklistItem[];
  category:  'trading' | 'strategy' | 'psychology' | 'market' | 'other';
  pinned:    boolean;
  timestamp: string;
  dateStr:   string;
  updatedAt: string;
}

export interface Stats {
  wins:             number;
  losses:           number;
  winRate:          number;
  totalPnl:         number;
  avgDiscipline:    number;
  maxWin:           number;
  maxLoss:          number;
  curWin:           number;
  bestTrade:        Trade | null;
  worstTrade:       Trade | null;
  thisWeekPnl:      number;
  thisMonthPnl:     number;
  thisWeekTrades:   number;
  thisMonthTrades:  number;
  thisWeekWinRate:  number;
  thisMonthWinRate: number;
  lastMonthPnl:     number;
  lastMonthTrades:  number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trade CRUD — duress-aware
// ─────────────────────────────────────────────────────────────────────────────

export async function loadTrades(): Promise<Trade[]> {
  try {
    const key = await tradesKey();
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveTrades(trades: Trade[]): Promise<void> {
  try {
    const key = await tradesKey();
    await AsyncStorage.setItem(key, JSON.stringify(trades));
  } catch {}
}

export async function addTrade(trade: Trade): Promise<Trade[]> {
  const trades  = await loadTrades();
  const updated = [trade, ...trades];
  await saveTrades(updated);
  return updated;
}

export async function updateTrade(updated: Trade): Promise<Trade[]> {
  const trades  = await loadTrades();
  const newList = trades.map((t) => (t.id === updated.id ? updated : t));
  await saveTrades(newList);
  return newList;
}

export async function deleteTrade(id: number): Promise<Trade[]> {
  const trades  = await loadTrades();
  const updated = trades.filter((t) => t.id !== id);
  await saveTrades(updated);
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backup & Export — duress-aware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a JSON string of current trades (for programmatic use).
 */
export async function backupTradesAsJSON(): Promise<string> {
  try {
    const trades = await loadTrades();
    return JSON.stringify(trades, null, 2);
  } catch {
    return '[]';
  }
}

/**
 * Exports trades as a real .json FILE and opens the system share sheet.
 * Sharing a file (not raw text) means WhatsApp, Email, etc. won't corrupt it.
 */
export async function exportTradesAsFile(): Promise<{ fileName: string; count: number }> {
  try {
    const trades = await loadTrades();
    if (trades.length === 0) throw new Error('No trades to export.');

    const json      = JSON.stringify(trades, null, 2);
    const timestamp = new Date().toISOString().split('T')[0]; // e.g. 2025-01-15
    const fileName  = `trade-protocol-backup-${timestamp}.json`;

    // Write to cache directory
    const file = new File(Paths.cache, fileName);
    if (file.exists) file.delete();
    file.create();
    file.write(json);

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) throw new Error('Sharing is not available on this device.');

    await Sharing.shareAsync(file.uri, {
      mimeType:    'application/json',
      dialogTitle: `Trade Protocol Backup — ${trades.length} trades`,
      UTI:         'public.json',
    });

    return { fileName, count: trades.length };
  } catch (e: any) {
    throw new Error(e.message ?? 'Failed to export backup file.');
  }
}

export async function clearAllTrades(): Promise<void> {
  try {
    const key = await tradesKey();
    await AsyncStorage.setItem(key, JSON.stringify([]));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Gallery CRUD — duress-aware
// ─────────────────────────────────────────────────────────────────────────────

export async function loadGallery(): Promise<GalleryImage[]> {
  try {
    const key = await galleryKey();
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveGallery(images: GalleryImage[]): Promise<void> {
  try {
    const key = await galleryKey();
    await AsyncStorage.setItem(key, JSON.stringify(images));
  } catch {}
}

function galleryDir(): Directory {
  return new Directory(Paths.document, 'gallery');
}

async function ensureGalleryDirectory(): Promise<Directory> {
  const dir = galleryDir();
  try {
    if (!dir.exists) {
      dir.create({ intermediates: true, idempotent: true });
    }
  } catch {}
  return dir;
}

export async function addGalleryImage(
  image: Omit<GalleryImage, 'id' | 'uri' | 'dateStr' | 'timestamp'> & { sourceUri: string }
): Promise<GalleryImage[]> {
  try {
    const dir         = await ensureGalleryDirectory();
    const fileName    = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const destination = new File(dir, fileName);
    const source      = new File(image.sourceUri);

    if (destination.exists) destination.delete();
    source.copy(destination);

    const now = new Date();
    const newImage: GalleryImage = {
      id:         Date.now() + Math.floor(Math.random() * 10000),
      uri:        destination.uri,
      title:      image.title,
      notes:      image.notes,
      category:   image.category,
      tradeId:    image.tradeId,
      tradePair:  image.tradePair,
      timestamp:  now.toISOString(),
      dateStr:    now.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      }),
      groupId:    image.groupId    ?? null,
      groupName:  image.groupName  ?? null,
      groupOrder: image.groupOrder ?? 0,
    };

    const existing = await loadGallery();
    const updated  = [newImage, ...existing];
    await saveGallery(updated);
    return updated;
  } catch (e: any) {
    throw new Error(e.message ?? 'Failed to save image.');
  }
}

export async function updateGalleryImage(
  updated: GalleryImage
): Promise<GalleryImage[]> {
  try {
    const images  = await loadGallery();
    const newList = images.map((img) => (img.id === updated.id ? updated : img));
    await saveGallery(newList);
    return newList;
  } catch (e: any) {
    throw new Error(e.message ?? 'Failed to update image.');
  }
}

export async function deleteGalleryImage(id: number): Promise<GalleryImage[]> {
  try {
    const images = await loadGallery();
    const target = images.find((img) => img.id === id);

    if (target?.uri) {
      const file = new File(target.uri);
      if (file.exists) file.delete();
    }

    const updated = images.filter((img) => img.id !== id);
    await saveGallery(updated);
    return updated;
  } catch (e: any) {
    throw new Error(e.message ?? 'Failed to delete image.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gallery grouping helpers
// ─────────────────────────────────────────────────────────────────────────────

export type GalleryGroup = {
  groupId:   string;
  groupName: string;
  coverUri:  string;
  category:  GalleryImage['category'];
  count:     number;
  images:    GalleryImage[];
  timestamp: string;
  tradeId:   number | null;
  tradePair: string | null;
};

export type GalleryEntry =
  | { kind: 'single'; image: GalleryImage }
  | { kind: 'group';  group: GalleryGroup };

export function buildGalleryEntries(images: GalleryImage[]): GalleryEntry[] {
  const groupsMap = new Map<string, GalleryImage[]>();
  const singles: GalleryImage[] = [];

  for (const img of images) {
    if (img.groupId) {
      if (!groupsMap.has(img.groupId)) groupsMap.set(img.groupId, []);
      groupsMap.get(img.groupId)!.push(img);
    } else {
      singles.push(img);
    }
  }

  const entries: GalleryEntry[] = [];

  for (const [gid, imgs] of groupsMap.entries()) {
    const sorted = [...imgs].sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));
    const first  = sorted[0];
    entries.push({
      kind: 'group',
      group: {
        groupId:   gid,
        groupName: first.groupName ?? first.title,
        coverUri:  first.uri,
        category:  first.category,
        count:     sorted.length,
        images:    sorted,
        timestamp: sorted.reduce(
          (n, img) => (img.timestamp > n ? img.timestamp : n),
          sorted[0].timestamp
        ),
        tradeId:   first.tradeId,
        tradePair: first.tradePair,
      },
    });
  }

  for (const img of singles) entries.push({ kind: 'single', image: img });

  entries.sort((a, b) => {
    const tA = a.kind === 'single' ? a.image.timestamp : a.group.timestamp;
    const tB = b.kind === 'single' ? b.image.timestamp : b.group.timestamp;
    return tB.localeCompare(tA);
  });

  return entries;
}

export async function loadGalleryGroup(groupId: string): Promise<GalleryImage[]> {
  try {
    const images = await loadGallery();
    return images
      .filter((i) => i.groupId === groupId)
      .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));
  } catch {
    return [];
  }
}

export async function deleteGalleryGroup(groupId: string): Promise<GalleryImage[]> {
  try {
    const images   = await loadGallery();
    const toDelete = images.filter((i) => i.groupId === groupId);

    for (const img of toDelete) {
      try {
        const file = new File(img.uri);
        if (file.exists) file.delete();
      } catch {}
    }

    const remaining = images.filter((i) => i.groupId !== groupId);
    await saveGallery(remaining);
    return remaining;
  } catch (e: any) {
    throw new Error(e.message ?? 'Failed to delete album.');
  }
}

export async function renameGalleryGroup(
  groupId: string,
  newName: string,
): Promise<GalleryImage[]> {
  try {
    const images  = await loadGallery();
    const updated = images.map((img) =>
      img.groupId === groupId ? { ...img, groupName: newName } : img
    );
    await saveGallery(updated);
    return updated;
  } catch (e: any) {
    throw new Error(e.message ?? 'Failed to rename album.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mental Log CRUD — duress-aware
// ─────────────────────────────────────────────────────────────────────────────

export async function loadMentalLogs(): Promise<MentalLog[]> {
  try {
    const key = await mentalKey();
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveMentalLogs(logs: MentalLog[]): Promise<void> {
  try {
    const key = await mentalKey();
    await AsyncStorage.setItem(key, JSON.stringify(logs));
  } catch {}
}

export async function saveMentalLog(log: MentalLog): Promise<MentalLog[]> {
  try {
    const logs          = await loadMentalLogs();
    const existingIndex = logs.findIndex((l) => l.id === log.id);

    if (existingIndex >= 0) {
      logs[existingIndex] = log;
    } else {
      logs.unshift(log);
    }

    await saveMentalLogs(logs);
    return logs;
  } catch (e: any) {
    throw new Error(e.message ?? 'Failed to save mental log.');
  }
}

export async function getMentalLogForDate(
  dateId: string
): Promise<MentalLog | null> {
  try {
    const logs = await loadMentalLogs();
    return logs.find((l) => l.id === dateId) ?? null;
  } catch {
    return null;
  }
}

export async function deleteMentalLog(dateId: string): Promise<MentalLog[]> {
  try {
    const logs    = await loadMentalLogs();
    const updated = logs.filter((l) => l.id !== dateId);
    await saveMentalLogs(updated);
    return updated;
  } catch (e: any) {
    throw new Error(e.message ?? 'Failed to delete mental log.');
  }
}

export async function getLast7DaysMentalLogs(): Promise<MentalLog[]> {
  try {
    const logs         = await loadMentalLogs();
    const now          = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    return logs
      .filter((l) => new Date(l.timestamp) >= sevenDaysAgo)
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Notes CRUD — duress-aware
// ─────────────────────────────────────────────────────────────────────────────

export async function loadNotes(): Promise<Note[]> {
  try {
    const key = await notesKey();
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveNotes(notes: Note[]): Promise<void> {
  try {
    const key = await notesKey();
    await AsyncStorage.setItem(key, JSON.stringify(notes));
  } catch {}
}

export async function addNote(
  note: Omit<Note, 'id' | 'timestamp' | 'dateStr' | 'updatedAt'>
): Promise<Note[]> {
  try {
    const now      = new Date();
    const newNote: Note = {
      ...note,
      id:        Date.now(),
      timestamp: now.toISOString(),
      dateStr:   now.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      }),
      updatedAt: now.toISOString(),
    };

    const notes   = await loadNotes();
    const updated = [newNote, ...notes];
    await saveNotes(updated);
    return updated;
  } catch (e: any) {
    throw new Error(e.message ?? 'Failed to add note.');
  }
}

export async function updateNote(updated: Note): Promise<Note[]> {
  try {
    const notes       = await loadNotes();
    const now         = new Date();
    const updatedNote = { ...updated, updatedAt: now.toISOString() };
    const newList     = notes.map((n) => (n.id === updated.id ? updatedNote : n));
    await saveNotes(newList);
    return newList;
  } catch (e: any) {
    throw new Error(e.message ?? 'Failed to update note.');
  }
}

export async function deleteNote(id: number): Promise<Note[]> {
  try {
    const notes   = await loadNotes();
    const updated = notes.filter((n) => n.id !== id);
    await saveNotes(updated);
    return updated;
  } catch (e: any) {
    throw new Error(e.message ?? 'Failed to delete note.');
  }
}

export async function toggleNotePin(id: number): Promise<Note[]> {
  try {
    const notes   = await loadNotes();
    const newList = notes.map((n) =>
      n.id === id
        ? { ...n, pinned: !n.pinned, updatedAt: new Date().toISOString() }
        : n
    );
    await saveNotes(newList);
    return newList;
  } catch (e: any) {
    throw new Error(e.message ?? 'Failed to toggle pin.');
  }
}

export async function toggleChecklistItem(
  noteId: number,
  itemId: number,
): Promise<Note[]> {
  try {
    const notes   = await loadNotes();
    const newList = notes.map((n) => {
      if (n.id !== noteId) return n;
      return {
        ...n,
        checklist: n.checklist.map((item) =>
          item.id === itemId ? { ...item, checked: !item.checked } : item
        ),
        updatedAt: new Date().toISOString(),
      };
    });
    await saveNotes(newList);
    return newList;
  } catch (e: any) {
    throw new Error(e.message ?? 'Failed to toggle checklist item.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Trades — bulletproof version
// ─────────────────────────────────────────────────────────────────────────────

export async function importTrades(jsonString: string): Promise<Trade[]> {
  try {
    // Clean common corruption — BOM, leading/trailing garbage
    const cleaned = jsonString
      .trim()
      .replace(/^\uFEFF/, '')       // strip BOM
      .replace(/^[^\[{]+/, '')      // strip anything before [ or {
      .replace(/[^\]}\s]+$/, '')    // strip anything after ] or }
      .trim();

    if (!cleaned) {
      throw new Error('Backup file is empty.');
    }

    if (!cleaned.startsWith('[')) {
      throw new Error(
        'This is not a valid trade backup file. Make sure you selected a .json file exported from Trade Protocol.'
      );
    }

    let parsed: any[];
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(
        'Backup file is corrupted or was modified. Export again and share as a file (not copy-paste).'
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Backup must contain an array of trades.');
    }

    if (parsed.length === 0) {
      throw new Error('Backup file contains no trades.');
    }

    // Validate first trade has minimum required fields
    const first = parsed[0];
    if (!first.id || !first.pair) {
      throw new Error('Backup file format is invalid — missing required fields (id, pair).');
    }

    // Always import into REAL storage key (not duress)
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const existing: Trade[] = raw
      ? (Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [])
      : [];

    const existingIds = new Set(existing.map((t) => t.id));
    const newTrades   = parsed.filter((t: Trade) => t.id && !existingIds.has(t.id));
    const merged      = [...newTrades, ...existing].sort((a, b) => b.id - a.id);

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch (e: any) {
    throw new Error(e.message ?? 'Import failed.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF Export — always uses REAL data
// ─────────────────────────────────────────────────────────────────────────────

function pnlColor(pnl: number): string {
  return pnl > 0 ? '#00d68f' : pnl < 0 ? '#ff6b6b' : '#888';
}

function resultColor(result: string): string {
  switch (result) {
    case 'win':  return '#00d68f';
    case 'loss': return '#ff6b6b';
    case 'be':   return '#ffd166';
    case 'open': return '#4fc3f7';
    default:     return '#888';
  }
}

function resultLabel(result: string): string {
  switch (result) {
    case 'win':  return 'WIN';
    case 'loss': return 'LOSS';
    case 'be':   return 'B/E';
    case 'open': return 'OPEN';
    default:     return result.toUpperCase();
  }
}

function scoreColor(score: number): string {
  return score >= 80 ? '#00d68f' : score >= 60 ? '#ffd166' : '#ff6b6b';
}

function formatPnl(pnl: number): string {
  if (pnl > 0) return `+$${pnl.toFixed(2)}`;
  if (pnl < 0) return `-$${Math.abs(pnl).toFixed(2)}`;
  return '$0.00';
}

function buildTradeHTML(trade: Trade, index: number): string {
  const sc         = scoreColor(trade.ruleScore);
  const rc         = resultColor(trade.result);
  const pc         = pnlColor(trade.pnl);
  const dirColor   = trade.dir === 'BUY' ? '#00d68f' : '#ff6b6b';
  const scoreWidth = Math.min(100, Math.round(trade.ruleScore));

  const modeBadge = trade.mode === 'pro'
    ? `<span style="display:inline-block;background:#00d68f18;border:1px solid #00d68f44;color:#00d68f;font-size:8px;padding:2px 7px;border-radius:10px;font-family:monospace;letter-spacing:1px;margin-left:8px;">⚡ PRO</span>`
    : `<span style="display:inline-block;background:#4fc3f718;border:1px solid #4fc3f744;color:#4fc3f7;font-size:8px;padding:2px 7px;border-radius:10px;font-family:monospace;letter-spacing:1px;margin-left:8px;">◈ FULL</span>`;

  const rulesHTML = trade.rules.length > 0
    ? trade.rules.map((r) => `<span style="display:inline-block;background:#00d68f18;border:1px solid #00d68f44;color:#00d68f;font-size:9px;padding:2px 7px;border-radius:10px;margin:2px;font-family:monospace;">✓ ${r}</span>`).join('')
    : '<span style="color:#888;font-size:11px;font-family:monospace;">No rules followed</span>';

  const tagsHTML = trade.tags && trade.tags.length > 0
    ? `<div style="margin-top:10px;"><div style="font-family:monospace;font-size:9px;color:rgba(0,0,0,0.4);letter-spacing:1px;margin-bottom:6px;">TAGS</div><div style="display:flex;flex-wrap:wrap;gap:4px;">${trade.tags.map((tag) => `<span style="display:inline-block;background:#4fc3f718;border:1px solid #4fc3f744;color:#4fc3f7;font-size:9px;padding:2px 7px;border-radius:10px;font-family:monospace;"># ${tag}</span>`).join('')}</div></div>`
    : '';

  const journalHTML = [
    trade.setup    ? `<div class="journal-block setup"><div class="journal-label">📋 SETUP NOTES</div><div class="journal-text">${trade.setup}</div></div>`                  : '',
    trade.emotions ? `<div class="journal-block emotions"><div class="journal-label">💭 EMOTIONS</div><div class="journal-text">${trade.emotions}</div></div>`                : '',
    trade.mistakes ? `<div class="journal-block mistakes"><div class="journal-label">⚠ MISTAKES</div><div class="journal-text mistake-text">${trade.mistakes}</div></div>`   : '',
    trade.lesson   ? `<div class="journal-block lesson"><div class="journal-label">💡 LESSON LEARNED</div><div class="journal-text lesson-text">${trade.lesson}</div></div>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="trade-card">
      <div class="trade-header">
        <div class="trade-header-left">
          <div class="trade-number">#${index + 1}</div>
          <div>
            <div class="trade-pair">
              ${trade.pair}
              <span style="color:${dirColor};font-size:14px;margin-left:8px;">${trade.dir}</span>
              <span class="trade-tf">${trade.timeframe}</span>
              ${modeBadge}
            </div>
            <div class="trade-meta">${trade.dateStr} &nbsp;·&nbsp; ${trade.timeStr} &nbsp;·&nbsp; ${trade.session} &nbsp;·&nbsp; ${trade.strategy}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="result-badge" style="background:${rc}22;border:1px solid ${rc}66;color:${rc};">${resultLabel(trade.result)}</span>
          <span class="pnl-value" style="color:${pc};">${formatPnl(trade.pnl)}</span>
        </div>
      </div>
      <div class="params-grid">
        <div class="param-item"><div class="param-label">ENTRY</div><div class="param-value">${trade.entry || '—'}</div></div>
        <div class="param-item"><div class="param-label">STOP LOSS</div><div class="param-value" style="color:#ff6b6b;">${trade.sl || '—'}</div></div>
        <div class="param-item"><div class="param-label">TAKE PROFIT</div><div class="param-value" style="color:#00d68f;">${trade.tp || '—'}</div></div>
        <div class="param-item"><div class="param-label">LOT SIZE</div><div class="param-value">${trade.lot || '—'}</div></div>
      </div>
      <div class="discipline-section">
        <div class="discipline-header">
          <span class="discipline-title">DISCIPLINE SCORE &nbsp;·&nbsp; <span style="font-size:8px;opacity:0.6;">${trade.mode === 'pro' ? '⚡ PRO MODE (10 rules)' : '◈ FULL MODE (25 rules)'}</span></span>
          <span class="discipline-pct" style="color:${sc};">${Math.round(trade.ruleScore)}% compliant</span>
        </div>
        <div class="score-bar-bg"><div class="score-bar-fill" style="width:${scoreWidth}%;background:${sc};"></div></div>
        <div class="score-label" style="color:${sc};">${trade.ruleScore >= 80 ? '✦ Excellent discipline' : trade.ruleScore >= 60 ? '◈ Good discipline' : '⚠ Low discipline — review your process'}</div>
        <div class="rules-container">${rulesHTML}</div>
        ${tagsHTML}
      </div>
      ${journalHTML ? `<div class="journal-section">${journalHTML}</div>` : ''}
    </div>
  `;
}

function buildPDFHTML(trades: Trade[]): string {
  const stats         = calcStats(trades);
  const exportDate    = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const totalPnlColor = pnlColor(stats.totalPnl);
  const wrColor       = stats.winRate >= 50 ? '#00d68f' : '#ff6b6b';
  const discColor     = scoreColor(stats.avgDiscipline);
  const tradesHTML    = trades.map((t, i) => buildTradeHTML(t, i)).join('');
  const proCount      = trades.filter((t) => t.mode === 'pro').length;
  const fullCount     = trades.filter((t) => t.mode === 'full').length;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #ffffff; color: #1a1a2e; font-size: 12px; }
    .cover { background: linear-gradient(135deg, #0b0b14 0%, #13131f 50%, #1c1c2e 100%); color: #eeeef0; padding: 60px 40px; min-height: 280px; page-break-after: always; }
    .cover-badge { display: inline-block; background: rgba(0,214,143,0.15); border: 1px solid rgba(0,214,143,0.4); color: #00d68f; font-family: monospace; font-size: 10px; letter-spacing: 2px; padding: 4px 12px; border-radius: 20px; margin-bottom: 20px; }
    .cover-title { font-size: 36px; font-weight: 800; color: #eeeef0; letter-spacing: 1px; margin-bottom: 8px; }
    .cover-subtitle { font-family: monospace; font-size: 13px; color: rgba(238,238,240,0.5); letter-spacing: 1px; margin-bottom: 40px; }
    .cover-meta { font-family: monospace; font-size: 11px; color: rgba(238,238,240,0.4); margin-bottom: 8px; }
    .cover-mode-row { font-family: monospace; font-size: 10px; color: rgba(238,238,240,0.35); margin-bottom: 32px; }
    .cover-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .cover-stat { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 16px; text-align: center; }
    .cover-stat-label { font-family: monospace; font-size: 8px; color: rgba(238,238,240,0.4); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; }
    .cover-stat-value { font-family: monospace; font-size: 22px; font-weight: 800; }
    .cover-stat-sub { font-family: monospace; font-size: 9px; color: rgba(238,238,240,0.35); margin-top: 4px; }
    .trades-section { padding: 32px 40px; }
    .section-header { display: flex; align-items: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #0b0b14; }
    .section-title { font-family: monospace; font-size: 11px; letter-spacing: 2px; color: rgba(0,0,0,0.4); text-transform: uppercase; }
    .section-count { margin-left: auto; font-family: monospace; font-size: 11px; color: rgba(0,0,0,0.3); }
    .trade-card { background: #fafafa; border: 1px solid #e8e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; page-break-inside: avoid; }
    .trade-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid #e8e8f0; }
    .trade-header-left { display: flex; align-items: flex-start; gap: 12px; }
    .trade-number { background: #0b0b14; color: #eeeef0; font-family: monospace; font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 6px; margin-top: 2px; white-space: nowrap; }
    .trade-pair { font-size: 18px; font-weight: 800; color: #0b0b14; letter-spacing: 0.5px; margin-bottom: 4px; }
    .trade-tf { font-family: monospace; font-size: 10px; background: rgba(0,0,0,0.08); padding: 2px 6px; border-radius: 4px; margin-left: 6px; color: rgba(0,0,0,0.5); }
    .trade-meta { font-family: monospace; font-size: 10px; color: rgba(0,0,0,0.4); }
    .result-badge { font-family: monospace; font-size: 10px; font-weight: 700; letter-spacing: 1px; padding: 3px 10px; border-radius: 20px; }
    .pnl-value { font-family: monospace; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }
    .params-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
    .param-item { background: #f0f0f8; border-radius: 8px; padding: 10px; text-align: center; }
    .param-label { font-family: monospace; font-size: 8px; color: rgba(0,0,0,0.4); letter-spacing: 1px; margin-bottom: 4px; text-transform: uppercase; }
    .param-value { font-family: monospace; font-size: 13px; font-weight: 700; color: #0b0b14; }
    .discipline-section { background: #f8f8ff; border-radius: 8px; padding: 14px; margin-bottom: 14px; }
    .discipline-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .discipline-title { font-family: monospace; font-size: 9px; color: rgba(0,0,0,0.4); letter-spacing: 1.5px; text-transform: uppercase; }
    .discipline-pct { font-family: monospace; font-size: 13px; font-weight: 800; }
    .score-bar-bg { height: 8px; background: #e0e0f0; border-radius: 4px; overflow: hidden; margin-bottom: 6px; }
    .score-bar-fill { height: 8px; border-radius: 4px; }
    .score-label { font-family: monospace; font-size: 9px; margin-bottom: 10px; }
    .rules-container { display: flex; flex-wrap: wrap; gap: 4px; }
    .journal-section { margin-top: 12px; }
    .journal-block { border-radius: 8px; padding: 12px; margin-bottom: 8px; }
    .setup     { background: rgba(255,209,102,0.08); border-left: 3px solid #ffd166; }
    .emotions  { background: rgba(79,195,247,0.08);  border-left: 3px solid #4fc3f7; }
    .mistakes  { background: rgba(255,107,107,0.08); border-left: 3px solid #ff6b6b; }
    .lesson    { background: rgba(0,214,143,0.08);   border-left: 3px solid #00d68f; }
    .journal-label { font-family: monospace; font-size: 9px; font-weight: 700; letter-spacing: 1px; color: rgba(0,0,0,0.5); text-transform: uppercase; margin-bottom: 6px; }
    .journal-text { font-size: 12px; color: #1a1a2e; line-height: 1.6; }
    .mistake-text { color: #cc4444; }
    .lesson-text  { color: #007755; }
    .footer { text-align: center; padding: 24px; border-top: 1px solid #e8e8f0; font-family: monospace; font-size: 9px; color: rgba(0,0,0,0.3); letter-spacing: 1px; }
    @media print { .trade-card { page-break-inside: avoid; } .cover { page-break-after: always; } }
  </style>
</head>
<body>
  <div class="cover">
    <div class="cover-badge">TRADING PSYCHOLOGY OS</div>
    <div class="cover-title">Trade Protocol</div>
    <div class="cover-subtitle">Discipline Journal — Full Export</div>
    <div class="cover-meta">Generated: ${exportDate} &nbsp;·&nbsp; ${trades.length} trades recorded</div>
    <div class="cover-mode-row">⚡ ${proCount} Pro Mode &nbsp;·&nbsp; ◈ ${fullCount} Full Mode</div>
    <div class="cover-stats">
      <div class="cover-stat">
        <div class="cover-stat-label">TOTAL TRADES</div>
        <div class="cover-stat-value" style="color:#4fc3f7;">${trades.length}</div>
        <div class="cover-stat-sub">${stats.wins}W / ${stats.losses}L</div>
      </div>
      <div class="cover-stat">
        <div class="cover-stat-label">WIN RATE</div>
        <div class="cover-stat-value" style="color:${wrColor};">${stats.winRate}%</div>
        <div class="cover-stat-sub">closed trades</div>
      </div>
      <div class="cover-stat">
        <div class="cover-stat-label">TOTAL P&L</div>
        <div class="cover-stat-value" style="color:${totalPnlColor};">${stats.totalPnl >= 0 ? '+' : ''}$${Math.abs(stats.totalPnl).toFixed(0)}</div>
        <div class="cover-stat-sub">all trades</div>
      </div>
      <div class="cover-stat">
        <div class="cover-stat-label">AVG DISCIPLINE</div>
        <div class="cover-stat-value" style="color:${discColor};">${stats.avgDiscipline}%</div>
        <div class="cover-stat-sub">rule adherence</div>
      </div>
    </div>
  </div>
  <div class="trades-section">
    <div class="section-header">
      <span class="section-title">Trade Log</span>
      <span class="section-count">${trades.length} entries</span>
    </div>
    ${tradesHTML}
  </div>
  <div class="footer">TRADE PROTOCOL &nbsp;·&nbsp; DISCIPLINE JOURNAL &nbsp;·&nbsp; ${exportDate}</div>
</body>
</html>`;
}

export async function exportTrades(): Promise<void> {
  try {
    const raw    = await AsyncStorage.getItem(STORAGE_KEY);
    const trades: Trade[] = raw
      ? (Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [])
      : [];

    if (trades.length === 0) throw new Error('No trades to export.');

    const html = buildPDFHTML(trades);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const canShare = await Sharing.isAvailableAsync();

    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType:    'application/pdf',
        dialogTitle: 'Export Trade Protocol Journal',
        UTI:         'com.adobe.pdf',
      });
    } else {
      throw new Error('Sharing is not available on this device.');
    }
  } catch (e: any) {
    throw new Error(e.message ?? 'PDF export failed.');
  }
}

export function calcStats(trades: Trade[]): Stats {
  const closed = trades.filter((t) => t.result === 'win' || t.result === 'loss');
  const wins    = closed.filter((t) => t.result === 'win').length;
  const losses  = closed.filter((t) => t.result === 'loss').length;
  const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0;
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const avgDiscipline = trades.length > 0
    ? Math.round(trades.reduce((sum, t) => sum + (t.ruleScore || 0), 0) / trades.length)
    : 0;

  const ordered = [...trades].reverse();
  let maxWin = 0, tempWin = 0, maxLoss = 0, tempLoss = 0;

  for (const t of ordered) {
    if (t.result === 'win') {
      tempWin++; tempLoss = 0;
      if (tempWin > maxWin) maxWin = tempWin;
    } else if (t.result === 'loss') {
      tempLoss++; tempWin = 0;
      if (tempLoss > maxLoss) maxLoss = tempLoss;
    } else {
      tempWin = 0; tempLoss = 0;
    }
  }

  let curWin = 0;
  for (const t of trades) {
    if (t.result === 'win') curWin++;
    else break;
  }

  const closedWithPnl = trades.filter((t) => t.result === 'win' || t.result === 'loss');
  const bestTrade  = closedWithPnl.length > 0 ? closedWithPnl.reduce((a, b) => (a.pnl > b.pnl ? a : b)) : null;
  const worstTrade = closedWithPnl.length > 0 ? closedWithPnl.reduce((a, b) => (a.pnl < b.pnl ? a : b)) : null;

  const now              = new Date();
  const startOfWeek      = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth     = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth   = new Date(now.getFullYear(), now.getMonth(), 1);

  const weekTrades         = trades.filter((t) => new Date(t.timestamp) >= startOfWeek);
  const monthTrades        = trades.filter((t) => new Date(t.timestamp) >= startOfMonth);
  const lastMonthTradesArr = trades.filter((t) => {
    const d = new Date(t.timestamp);
    return d >= startOfLastMonth && d < endOfLastMonth;
  });

  const thisWeekPnl    = weekTrades.reduce((s, t) => s + t.pnl, 0);
  const thisMonthPnl   = monthTrades.reduce((s, t) => s + t.pnl, 0);
  const lastMonthPnl   = lastMonthTradesArr.reduce((s, t) => s + t.pnl, 0);
  const thisWeekTrades  = weekTrades.length;
  const thisMonthTrades = monthTrades.length;
  const lastMonthTrades = lastMonthTradesArr.length;

  const weekClosed  = weekTrades.filter((t) => t.result === 'win' || t.result === 'loss');
  const weekWins    = weekClosed.filter((t) => t.result === 'win').length;
  const thisWeekWinRate = weekClosed.length > 0 ? Math.round((weekWins / weekClosed.length) * 100) : 0;

  const monthClosed = monthTrades.filter((t) => t.result === 'win' || t.result === 'loss');
  const monthWins   = monthClosed.filter((t) => t.result === 'win').length;
  const thisMonthWinRate = monthClosed.length > 0 ? Math.round((monthWins / monthClosed.length) * 100) : 0;

  return {
    wins, losses, winRate, totalPnl, avgDiscipline,
    maxWin, maxLoss, curWin, bestTrade, worstTrade,
    thisWeekPnl, thisMonthPnl, thisWeekTrades, thisMonthTrades,
    thisWeekWinRate, thisMonthWinRate, lastMonthPnl, lastMonthTrades,
  };
}
// ─────────────────────────────────────────────────────────────────────────────
// Monthly Grouping Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getMonthKey(timestamp: string): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`; // e.g. "2026-06"
}

export function getMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  }); // e.g. "June 2026"
}

export type MonthStats = {
  key:           string;
  label:         string;
  trades:        Trade[];
  count:         number;
  wins:          number;
  losses:        number;
  winRate:       number;
  totalPnl:      number;
  avgDiscipline: number;
};

export function groupTradesByMonth(trades: Trade[]): MonthStats[] {
  const map = new Map<string, Trade[]>();

  for (const t of trades) {
    const key = getMonthKey(t.timestamp);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }

  const months: MonthStats[] = [];

  for (const [key, ts] of map.entries()) {
    const closed = ts.filter((t) => t.result === 'win' || t.result === 'loss');
    const wins   = closed.filter((t) => t.result === 'win').length;
    const losses = closed.filter((t) => t.result === 'loss').length;

    months.push({
      key,
      label:         getMonthLabel(key),
      trades:        ts,
      count:         ts.length,
      wins,
      losses,
      winRate:       closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0,
      totalPnl:      ts.reduce((s, t) => s + (t.pnl || 0), 0),
      avgDiscipline: ts.length > 0 ? Math.round(ts.reduce((s, t) => s + (t.ruleScore || 0), 0) / ts.length) : 0,
    });
  }

  // Sort newest month first
  return months.sort((a, b) => b.key.localeCompare(a.key));
}