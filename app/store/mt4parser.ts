import { Trade } from './trades';
import { format, parse, isValid } from 'date-fns';

// ── MT4/MT5 raw deal from CSV or HTML ─────────────────────────────────────────
export interface MT4Deal {
  ticket: string;
  openTime: string;
  closeTime: string;
  type: string;
  size: string;
  symbol: string;
  openPrice: string;
  sl: string;
  tp: string;
  closePrice: string;
  commission: string;
  swap: string;
  profit: string;
}

export interface ParseResult {
  deals: MT4Deal[];
  format: 'csv' | 'html' | 'unknown';
  errors: string[];
  account?: string;
  currency?: string;
}

export interface ImportPreview {
  total: number;
  wins: number;
  losses: number;
  breakeven: number;
  totalPnl: number;
  pairs: string[];
  dateRange: { from: string; to: string } | null;
  trades: Partial<Trade>[];
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function cleanStr(s: string): string {
  return s.replace(/\r/g, '').trim();
}

function parseMT4Date(raw: string): Date | null {
  if (!raw || raw.trim() === '') return null;
  const cleaned = raw.trim();

  // MT4 formats: "2026.04.24 09:15", "2026.04.24 09:15:32"
  const formats = [
    'yyyy.MM.dd HH:mm:ss',
    'yyyy.MM.dd HH:mm',
    'yyyy-MM-dd HH:mm:ss',
    'yyyy-MM-dd HH:mm',
    'dd.MM.yyyy HH:mm:ss',
    'dd.MM.yyyy HH:mm',
    'MM/dd/yyyy HH:mm:ss',
    'MM/dd/yyyy HH:mm',
  ];

  for (const fmt of formats) {
    try {
      const d = parse(cleaned, fmt, new Date());
      if (isValid(d)) return d;
    } catch {}
  }

  // Try native Date parse as fallback
  const native = new Date(cleaned);
  if (isValid(native)) return native;

  return null;
}

function detectDirection(type: string): 'BUY' | 'SELL' {
  const t = type.toLowerCase().trim();
  if (t === 'buy' || t === '0' || t === 'buy limit' || t === 'buy stop') return 'BUY';
  if (t === 'sell' || t === '1' || t === 'sell limit' || t === 'sell stop') return 'SELL';
  return 'BUY';
}

function detectResult(profit: number): 'win' | 'loss' | 'be' {
  if (profit > 0.01) return 'win';
  if (profit < -0.01) return 'loss';
  return 'be';
}

function normalizePair(symbol: string): string {
  return symbol.replace(/[._\-]/g, '').toUpperCase().trim();
}

// ── Strip HTML tags ───────────────────────────────────────────────────────────
function stripHTML(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Parse CSV ─────────────────────────────────────────────────────────────────
export function parseMT4CSV(content: string): ParseResult {
  const errors: string[] = [];
  const deals: MT4Deal[] = [];

  const lines = content
    .split('\n')
    .map((l) => cleanStr(l))
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { deals: [], format: 'csv', errors: ['File is empty or too short.'] };
  }

  // Find header line
  let headerIndex = -1;
  let headerLine = '';

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const lower = lines[i].toLowerCase();
    if (
      lower.includes('ticket') ||
      lower.includes('open time') ||
      lower.includes('symbol') ||
      lower.includes('profit') ||
      lower.includes('deal') ||
      lower.includes('type')
    ) {
      headerIndex = i;
      headerLine = lines[i];
      break;
    }
  }

  if (headerIndex === -1) {
    // Try to parse without header — assume standard MT4 order
    headerIndex = 0;
    headerLine = 'Ticket,Open Time,Type,Size,Item,Price,S/L,T/P,Close Time,Price,Commission,Taxes,Swap,Profit';
  }

  // Parse CSV header columns
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseCSVLine(headerLine).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, '')
  );

  // Column index mapping
  const col = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex((h) => h.includes(name));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const ticketIdx    = col(['ticket', 'deal', 'order']);
  const openTimeIdx  = col(['opentime', 'time', 'opentimestamp']);
  const closeTimeIdx = col(['closetime', 'closedat']);
  const typeIdx      = col(['type', 'direction', 'action']);
  const sizeIdx      = col(['size', 'volume', 'lots', 'qty']);
  const symbolIdx    = col(['item', 'symbol', 'pair', 'instrument']);
  const openPriceIdx = col(['openprice', 'price', 'entryprice', 'open']);
  const slIdx        = col(['sl', 'stoploss', 'stop']);
  const tpIdx        = col(['tp', 'takeprofit', 'target']);
  const closePriceIdx = col(['closeprice', 'exitprice', 'close']);
  const commIdx      = col(['commission', 'comm', 'fee']);
  const swapIdx      = col(['swap', 'rollover']);
  const profitIdx    = col(['profit', 'pnl', 'gain', 'return']);

  // Parse data rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    const cols = parseCSVLine(line);
    if (cols.length < 5) continue;

    // Skip summary/total rows
    const firstCol = cols[0]?.toLowerCase() ?? '';
    if (
      firstCol.includes('total') ||
      firstCol.includes('deposit') ||
      firstCol.includes('withdrawal') ||
      firstCol.includes('balance') ||
      firstCol.includes('credit')
    ) continue;

    const profit = parseFloat(cols[profitIdx] ?? '0') || 0;

    // Skip non-trade rows (deposits, balance adjustments)
    const typeVal = cols[typeIdx]?.toLowerCase() ?? '';
    if (
      typeVal.includes('balance') ||
      typeVal.includes('deposit') ||
      typeVal.includes('withdrawal') ||
      typeVal.includes('credit') ||
      typeVal.includes('correction')
    ) continue;

    deals.push({
      ticket:     cols[ticketIdx]     ?? String(i),
      openTime:   cols[openTimeIdx]   ?? '',
      closeTime:  cols[closeTimeIdx]  ?? '',
      type:       cols[typeIdx]       ?? 'buy',
      size:       cols[sizeIdx]       ?? '0.01',
      symbol:     cols[symbolIdx]     ?? 'UNKNOWN',
      openPrice:  cols[openPriceIdx]  ?? '0',
      sl:         cols[slIdx]         ?? '',
      tp:         cols[tpIdx]         ?? '',
      closePrice: cols[closePriceIdx] ?? '0',
      commission: cols[commIdx]       ?? '0',
      swap:       cols[swapIdx]       ?? '0',
      profit:     String(profit),
    });
  }

  if (deals.length === 0) {
    errors.push('No trade records found. Please check the file format.');
  }

  return { deals, format: 'csv', errors };
}

// ── Parse MT4 HTML Statement ──────────────────────────────────────────────────
export function parseMT4HTML(content: string): ParseResult {
  const errors: string[] = [];
  const deals: MT4Deal[] = [];

  // Extract account info
  const accountMatch = content.match(/Account:\s*(\d+)/i);
  const currencyMatch = content.match(/Currency:\s*([A-Z]+)/i);
  const account = accountMatch?.[1];
  const currency = currencyMatch?.[1];

  // Extract table rows from HTML
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let rows: string[][] = [];
  let rowMatch;

  while ((rowMatch = rowRegex.exec(content)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.push(stripHTML(cellMatch[1]).trim());
    }
    if (cells.length >= 6) {
      rows.push(cells);
    }
  }

  if (rows.length === 0) {
    return {
      deals: [],
      format: 'html',
      errors: ['No table data found in HTML file.'],
      account,
      currency,
    };
  }

  // Find header row
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i].join(' ').toLowerCase();
    if (
      (row.includes('ticket') || row.includes('deal')) &&
      (row.includes('profit') || row.includes('type'))
    ) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    // Try without header
    headerRowIdx = -1;
  }

  const headers =
    headerRowIdx >= 0
      ? rows[headerRowIdx].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
      : [];

  const col = (names: string[]): number => {
    if (headers.length === 0) return -1;
    for (const name of names) {
      const idx = headers.findIndex((h) => h.includes(name));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // MT4 HTML standard column order fallback:
  // Ticket | Open Time | Type | Size | Item | Price | S/L | T/P | Close Time | Close Price | Commission | Taxes | Swap | Profit
  const ticketIdx     = col(['ticket', 'deal']) !== -1 ? col(['ticket', 'deal']) : 0;
  const openTimeIdx   = col(['opentime', 'time']) !== -1 ? col(['opentime', 'time']) : 1;
  const typeIdx       = col(['type', 'action']) !== -1 ? col(['type', 'action']) : 2;
  const sizeIdx       = col(['size', 'volume', 'lots']) !== -1 ? col(['size', 'volume', 'lots']) : 3;
  const symbolIdx     = col(['item', 'symbol']) !== -1 ? col(['item', 'symbol']) : 4;
  const openPriceIdx  = col(['openprice', 'price', 'open']) !== -1 ? col(['openprice', 'price', 'open']) : 5;
  const slIdx         = col(['sl']) !== -1 ? col(['sl']) : 6;
  const tpIdx         = col(['tp']) !== -1 ? col(['tp']) : 7;
  const closeTimeIdx  = col(['closetime']) !== -1 ? col(['closetime']) : 8;
  const closePriceIdx = col(['closeprice', 'close']) !== -1 ? col(['closeprice', 'close']) : 9;
  const commIdx       = col(['commission', 'comm']) !== -1 ? col(['commission', 'comm']) : 10;
  const swapIdx       = col(['swap']) !== -1 ? col(['swap']) : 12;
  const profitIdx     = col(['profit', 'pnl']) !== -1 ? col(['profit', 'pnl']) : 13;

  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 6) continue;

    const typeVal = (row[typeIdx] ?? '').toLowerCase();
    if (
      typeVal.includes('balance') ||
      typeVal.includes('deposit') ||
      typeVal.includes('withdrawal') ||
      typeVal.includes('credit') ||
      typeVal === '' ||
      typeVal.includes('total')
    ) continue;

    const ticketVal = row[ticketIdx] ?? '';
    if (!ticketVal || ticketVal.toLowerCase().includes('ticket')) continue;

    const profitStr = row[profitIdx] ?? '0';
    const profitNum = parseFloat(profitStr.replace(/[^\d.\-]/g, '')) || 0;

    deals.push({
      ticket:     ticketVal,
      openTime:   row[openTimeIdx]   ?? '',
      closeTime:  row[closeTimeIdx]  ?? '',
      type:       row[typeIdx]       ?? 'buy',
      size:       row[sizeIdx]       ?? '0.01',
      symbol:     row[symbolIdx]     ?? 'UNKNOWN',
      openPrice:  row[openPriceIdx]  ?? '0',
      sl:         row[slIdx]         ?? '',
      tp:         row[tpIdx]         ?? '',
      closePrice: row[closePriceIdx] ?? '0',
      commission: row[commIdx]       ?? '0',
      swap:       row[swapIdx]       ?? '0',
      profit:     String(profitNum),
    });
  }

  if (deals.length === 0) {
    errors.push(
      'No closed trade records found. Make sure your statement includes closed trades.'
    );
  }

  return { deals, format: 'html', errors, account, currency };
}

// ── Main parser — auto-detect format ─────────────────────────────────────────
export function parseMT4File(content: string): ParseResult {
  const trimmed = content.trim();

  if (
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.toLowerCase().includes('<table') ||
    trimmed.toLowerCase().includes('<tr')
  ) {
    return parseMT4HTML(content);
  }

  return parseMT4CSV(content);
}

// ── Convert MT4 deals to Trade objects ───────────────────────────────────────
export function convertDealsToTrades(
  deals: MT4Deal[],
  existingIds: Set<number>
): { trades: Partial<Trade>[]; skipped: number } {
  const trades: Partial<Trade>[] = [];
  let skipped = 0;

  for (const deal of deals) {
    const profit = parseFloat(deal.profit) || 0;
    const openDate = parseMT4Date(deal.openTime);
    const closeDate = parseMT4Date(deal.closeTime) ?? openDate ?? new Date();

    if (!openDate) {
      skipped++;
      continue;
    }

    const result = detectResult(profit);
    const dir = detectDirection(deal.type);
    const pair = normalizePair(deal.symbol);

    // Generate a stable ID from ticket number
    const ticketNum = parseInt(deal.ticket) || Date.now();
    const id = ticketNum;

    if (existingIds.has(id)) {
      skipped++;
      continue;
    }

    const trade: Partial<Trade> = {
      id,
      pair,
      dir,
      entry:     deal.openPrice  || '0',
      lot:       deal.size       || '0.01',
      sl:        deal.sl         || '',
      tp:        deal.tp         || '',
      pnl:       profit,
      session:   detectSession(closeDate),
      result,
      strategy:  'Price Action',
      timeframe: 'H1',
      rules:     [],
      ruleScore: 0,
      emotions:  '',
      mistakes:  '',
      lesson:    '',
      setup:     `Imported from MT4/MT5. Ticket #${deal.ticket}`,
      timestamp: closeDate.toISOString(),
      dateStr:   format(closeDate, 'd MMM yyyy'),
      timeStr:   format(closeDate, 'HH:mm'),
      tags:      [],
    };

    trades.push(trade);
    existingIds.add(id);
  }

  return { trades, skipped };
}

// ── Detect session from close time ────────────────────────────────────────────
function detectSession(date: Date): string {
  const hour = date.getUTCHours();
  if (hour >= 0 && hour < 8)   return 'Asian';
  if (hour >= 8 && hour < 12)  return 'London';
  if (hour >= 12 && hour < 17) return 'Overlap';
  if (hour >= 17 && hour < 22) return 'New York';
  return 'Other';
}

// ── Build import preview ──────────────────────────────────────────────────────
export function buildImportPreview(trades: Partial<Trade>[]): ImportPreview {
  const wins      = trades.filter((t) => t.result === 'win').length;
  const losses    = trades.filter((t) => t.result === 'loss').length;
  const breakeven = trades.filter((t) => t.result === 'be').length;
  const totalPnl  = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const pairs     = [...new Set(trades.map((t) => t.pair ?? ''))].filter(Boolean);

  let dateRange: { from: string; to: string } | null = null;
  const timestamps = trades
    .map((t) => t.timestamp)
    .filter(Boolean)
    .map((ts) => new Date(ts!).getTime())
    .sort((a, b) => a - b);

  if (timestamps.length > 0) {
    dateRange = {
      from: format(new Date(timestamps[0]), 'd MMM yyyy'),
      to:   format(new Date(timestamps[timestamps.length - 1]), 'd MMM yyyy'),
    };
  }

  return {
    total: trades.length,
    wins,
    losses,
    breakeven,
    totalPnl,
    pairs,
    dateRange,
    trades,
  };
}