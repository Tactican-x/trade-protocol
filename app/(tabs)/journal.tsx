import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Line } from 'react-native-svg';
import { format } from 'date-fns'; // Production safe date formatting
import {
  loadJournal,
  deleteJournalEntry,
  JournalEntry,
  Mood,
  getTodayQuote,
} from '../store/journal';
import {
  Trade,
  MentalLog,
  Note,
  loadTrades,
  loadNotes,
  loadMentalLogs,
  getLast7DaysMentalLogs,
} from '../store/trades';
import { colors, font, spacing, radius } from '../theme';
import { Toast } from '../components/UI';
import { useAppContext } from '../context/AppContext';

const { width } = Dimensions.get('window');

// ── Constants ─────────────────────────────────────────────────────────────

const MOOD_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  focused:    { emoji: '🎯', color: '#00d68f', label: 'Focused' },
  neutral:    { emoji: '😐', color: '#ffd166', label: 'Neutral' },
  anxious:    { emoji: '😰', color: '#ff6b6b', label: 'Anxious' },
  frustrated: { emoji: '😤', color: '#ff6b6b', label: 'Frustrated' },
  tired:      { emoji: '😴', color: '#a78bfa', label: 'Tired' },
  confident:  { emoji: '💪', color: '#4fc3f7', label: 'Confident' },
};

const LEGACY_MOOD_MAP: Record<Mood, { emoji: string; color: string; label: string }> = {
  great:    { emoji: '😄', color: '#00d68f', label: 'Great' },
  good:     { emoji: '🙂', color: '#4fc3f7', label: 'Good' },
  neutral:  { emoji: '😐', color: '#ffd166', label: 'Neutral' },
  bad:      { emoji: '😞', color: '#ff9966', label: 'Bad' },
  terrible: { emoji: '😤', color: '#ff6b6b', label: 'Terrible' },
};

const NOTE_CATEGORY_COLORS: Record<string, string> = {
  trading:    '#4fc3f7',
  strategy:   '#00d68f',
  psychology: '#ffd166',
  market:     '#ff6b6b',
  other:      '#a78bfa',
};

// ── Currency Reference ───────────────────────────────────────────────────────
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  KES: 'KSh',
  UGX: 'USh',
  ZAR: 'R',
  NGN: '₦',
  INR: '₹',
  AUD: 'A$',
};

type TabKey = 'trades' | 'mental' | 'notes';

// ─────────────────────────────────────────────────────────────────────────────
// Date Helpers (Production Safe)
// ─────────────────────────────────────────────────────────────────────────────
function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function toDateId(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayId(): string {
  return toDateId(new Date());
}

function parseDateId(id: string): Date {
  const [y, m, d] = id.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getFormattedDateStr(dateId: string): string {
  try {
    return format(parseDateId(dateId), 'dd MMM yyyy');
  } catch {
    return dateId;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Smooth curve helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function buildSmoothPath(points: { x: number; y: number }[], svgH: number): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  }
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const prev      = points[i - 1] ?? points[i];
    const current   = points[i];
    const next      = points[i + 1];
    const afterNext = points[i + 2] ?? next;
    const tension = 0.25;
    const cp1x = current.x + (next.x - prev.x) * tension;
    const cp1y = clamp(current.y + (next.y - prev.y) * tension, 0, svgH);
    const cp2x = next.x - (afterNext.x - current.x) * tension;
    const cp2y = clamp(next.y - (afterNext.y - current.y) * tension, 0, svgH);
    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }
  return path;
}

function buildAreaPath(points: { x: number; y: number }[], svgH: number): string {
  if (points.length < 2) return '';
  const curvePath  = buildSmoothPath(points, svgH);
  const lastPoint  = points[points.length - 1];
  const firstPoint = points[0];
  return `${curvePath} L ${lastPoint.x.toFixed(2)} ${svgH} L ${firstPoint.x.toFixed(2)} ${svgH} Z`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mental Mood Graph
// ─────────────────────────────────────────────────────────────────────────────

const GRAPH_METRICS = [
  { key: 'focusLevel', label: 'Focus',      color: colors.green },
  { key: 'patience',   label: 'Patience',   color: colors.blue  },
  { key: 'confidence', label: 'Confidence', color: colors.amber  },
];

function MoodGraph({ weekLogs }: { weekLogs: MentalLog[] }) {
  if (weekLogs.length === 0) return null;

  const WRAPPER_W   = width - spacing.lg * 2 - spacing.md * 2;
  const DOT_R       = 3.5;
  const GLOW_R      = 6;
  const VAL_LABEL_H = 16;
  const PAD_TOP     = VAL_LABEL_H + GLOW_R + 2;
  const PAD_BOTTOM  = GLOW_R + 4;
  const PAD_LEFT    = GLOW_R + 2;
  const PAD_RIGHT   = GLOW_R + 2;
  const DRAW_H      = 70;
  const DRAW_W      = WRAPPER_W - PAD_LEFT - PAD_RIGHT;
  const SVG_H       = PAD_TOP + DRAW_H + PAD_BOTTOM;
  const MAX_VAL = 10;

  const valToY = (val: number) => PAD_TOP + DRAW_H - (Math.min(MAX_VAL, Math.max(0, val)) / MAX_VAL) * DRAW_H;

  return (
    <View style={styles.graphCard}>
      <Text style={styles.sectionLabel}>7-DAY MENTAL TREND</Text>

      {GRAPH_METRICS.map((metric) => {
        const points = weekLogs.map((log, i) => {
          const x = PAD_LEFT + (weekLogs.length > 1 ? (i / (weekLogs.length - 1)) * DRAW_W : DRAW_W / 2);
          const val = (log as any)[metric.key] ?? 0;
          const y   = valToY(val);
          return { x, y, val };
        });

        const curvePath = buildSmoothPath(points, SVG_H);
        const areaPath  = buildAreaPath(points, SVG_H);
        const gradId    = `grad-${metric.key}`;

        return (
          <View key={metric.key} style={{ marginBottom: spacing.md }}>
            <Text style={[styles.graphMetricLabel, { color: metric.color }]}>{metric.label}</Text>
            <View style={{ height: SVG_H, position: 'relative' }}>
              <Svg width={WRAPPER_W} height={SVG_H} style={{ position: 'absolute', top: 0, left: 0 }}>
                <Defs>
                  <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={metric.color} stopOpacity="0.25" />
                    <Stop offset="1" stopColor={metric.color} stopOpacity="0.02" />
                  </LinearGradient>
                </Defs>
                {[0, 2.5, 5, 7.5, 10].map((v) => {
                  const y = valToY(v);
                  return <Line key={v} x1={PAD_LEFT} y1={y} x2={PAD_LEFT + DRAW_W} y2={y} stroke={colors.border} strokeWidth={0.5} opacity={0.5} />;
                })}
                {areaPath ? <Path d={areaPath} fill={`url(#${gradId})`} /> : null}
                {curvePath ? <Path d={curvePath} stroke={metric.color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
                {points.map((p, i) => (
                  <React.Fragment key={`dot-${i}`}>
                    <Circle cx={p.x} cy={p.y} r={GLOW_R} fill={metric.color} opacity={0.15} />
                    <Circle cx={p.x} cy={p.y} r={DOT_R} fill={metric.color} />
                    <Circle cx={p.x} cy={p.y} r={1.5} fill={colors.surface} />
                  </React.Fragment>
                ))}
              </Svg>
              {points.map((p, i) => (
                <Text key={`val-${i}`} style={[styles.graphValueLabel, { left: p.x - 8, top: p.y - VAL_LABEL_H - DOT_R, color: metric.color }]}>{p.val}</Text>
              ))}
            </View>
          </View>
        );
      })}

      <View style={styles.graphDayRow}>
        {weekLogs.map((log) => {
          const day = format(new Date(log.date), 'EEE'); // Production Safe
          return <Text key={log.id} style={styles.graphDayLabel}>{day}</Text>;
        })}
      </View>
      <View style={styles.graphMoodRow}>
        {weekLogs.map((log) => {
          const cfg = MOOD_CONFIG[log.mood] ?? MOOD_CONFIG.neutral;
          return <Text key={`mood-${log.id}`} style={styles.graphMoodEmoji}>{cfg.emoji}</Text>;
        })}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Picker Modal
// ─────────────────────────────────────────────────────────────────────────────
function DatePickerModal({
  visible, currentDateId, loggedDates, onSelect, onClose,
}: {
  visible: boolean;
  currentDateId: string;
  loggedDates: Set<string>;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = currentDateId ? parseDateId(currentDateId) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    if (visible && currentDateId) {
      const d = parseDateId(currentDateId);
      setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [visible, currentDateId]);

  const monthName = format(viewMonth, 'MMMM yyyy'); // Production Safe
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const today = todayId();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const goPrevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const goNextMonth = () => {
    const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
    if (next <= new Date()) setViewMonth(next);
  };
  const canGoNext = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1) <= new Date();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={pickerStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={pickerStyles.sheet} onPress={() => {}}>
          <View style={pickerStyles.header}>
            <TouchableOpacity onPress={goPrevMonth} style={pickerStyles.navBtn}>
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </TouchableOpacity>
            <Text style={pickerStyles.monthText}>{monthName}</Text>
            <TouchableOpacity onPress={goNextMonth} style={[pickerStyles.navBtn, !canGoNext && { opacity: 0.3 }]} disabled={!canGoNext}>
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={pickerStyles.weekHeader}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <Text key={i} style={pickerStyles.weekDay}>{d}</Text>
            ))}
          </View>

          <View style={pickerStyles.grid}>
            {cells.map((day, i) => {
              if (day === null) return <View key={i} style={pickerStyles.cell} />;
              const dateId = toDateId(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
              const isSelected = dateId === currentDateId;
              const isTodayCell = dateId === today;
              const isFutureCell = dateId > today;
              const hasLog = loggedDates.has(dateId);

              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    pickerStyles.cell,
                    isSelected && { backgroundColor: colors.green + '33', borderColor: colors.green },
                    isTodayCell && !isSelected && { borderColor: colors.blue + '88' },
                    isFutureCell && { opacity: 0.3 },
                  ]}
                  onPress={() => {
                    if (!isFutureCell) {
                      onSelect(dateId);
                      Haptics.selectionAsync();
                    }
                  }}
                  disabled={isFutureCell}
                  activeOpacity={0.7}
                >
                  <Text style={[pickerStyles.dayNum, isSelected && { color: colors.green, fontWeight: '800' }, isTodayCell && !isSelected && { color: colors.blue }]}>{day}</Text>
                  {hasLog && <View style={[pickerStyles.dot, { backgroundColor: isSelected ? colors.green : colors.text }]} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={pickerStyles.legend}>
            <View style={pickerStyles.legendItem}>
              <View style={[pickerStyles.dot, { backgroundColor: colors.text }]} />
              <Text style={pickerStyles.legendText}>Has mental log</Text>
            </View>
            <TouchableOpacity onPress={() => { onSelect(today); Haptics.selectionAsync(); }}>
              <Text style={[pickerStyles.legendText, { color: colors.blue }]}>Select Today</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 20 },
  sheet:      { backgroundColor: colors.bg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn:     { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  monthText:  { fontSize: 14, fontWeight: '800', color: colors.text },
  weekHeader: { flexDirection: 'row', marginBottom: 6 },
  weekDay:    { flex: 1, textAlign: 'center', fontSize: 10, color: colors.muted, fontFamily: font.mono, fontWeight: '700' },
  grid:       { flexDirection: 'row', flexWrap: 'wrap' },
  cell:       { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 8 }, // Fixed layout width
  dayNum:     { fontSize: 12, color: colors.text, fontFamily: font.mono },
  dot:        { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  legend:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 10, color: colors.muted, fontFamily: font.mono },
});


// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function JournalScreen() {
  const router = useRouter();
  const { accent } = useAppContext();

  const [activeTab, setActiveTab]       = useState<TabKey>('trades');
  const [trades, setTrades]             = useState<Trade[]>([]);
  const [notes, setNotes]               = useState<Note[]>([]);
  const [mentalLogs, setMentalLogs]     = useState<MentalLog[]>([]);
  const [weekLogs, setWeekLogs]         = useState<MentalLog[]>([]);
  const [legacyLogs, setLegacyLogs]     = useState<JournalEntry[]>([]);
  const [refreshing, setRefreshing]     = useState(false);
  const [toastMsg, setToastMsg]         = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // Dynamic Base Currency preferences
  const [currencyCode, setCurrencyCode]   = useState('USD');
  const [isCentAccount, setIsCentAccount] = useState(false);

  // Date Selector State
  const [activeDate, setActiveDate]         = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());

  const quote = getTodayQuote();

  const loadAll = useCallback(async () => {
    const [t, n, ml, wl, legacy, storedCur, storedCent] = await Promise.all([
      loadTrades(),
      loadNotes(),
      loadMentalLogs(),
      getLast7DaysMentalLogs(),
      loadJournal(),
      AsyncStorage.getItem('@currency'),
      AsyncStorage.getItem('@is_cent_account'),
    ]);
    setTrades(t);
    setNotes(n);
    setMentalLogs(ml);
    setWeekLogs(wl);
    setLegacyLogs(legacy);
    setCurrencyCode(storedCur || 'USD');
    setIsCentAccount(storedCent === 'true');
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(false);
    setTimeout(() => setToastVisible(true), 50);
  };

  const currencySymbol = useMemo(() => {
    return CURRENCY_SYMBOLS[currencyCode] || '$';
  }, [currencyCode]);

  // Unified formatting utility supporting normal / Cent Modes
  const formatCurrencyValue = useCallback((n: number) => {
    const abs = Math.abs(n);
    const sign = n >= 0 ? '+' : '-';
    
    if (isCentAccount) {
      return `${sign}${Math.round(abs).toLocaleString('en-US')} USC`;
    }
    
    const formattedNum = abs.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${sign}${currencySymbol}${formattedNum}`;
  }, [isCentAccount, currencySymbol]);

  // ── Chronological sorting (Newest First) for Trades ──────────────
  const sortedTrades = useMemo(() => {
    return [...trades].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [trades]);

  // ── Chronological sorting (Newest First) for Mental Logs ────
  const filteredMentalLogs = useMemo(() => {
    const list = activeDate
      ? mentalLogs.filter((log) => log.date === activeDate)
      : [...mentalLogs];

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [mentalLogs, activeDate]);

  // ── Chronological sorting (Newest First) for Legacy Logs ────
  const filteredLegacyLogs = useMemo(() => {
    const list = activeDate
      ? legacyLogs.filter((log) => {
          const logDate = toDateId(new Date(log.timestamp));
          return logDate === activeDate;
        })
      : [...legacyLogs];

    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [legacyLogs, activeDate]);

  const loggedDates = useMemo(() => new Set(mentalLogs.map((l) => l.date)), [mentalLogs]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const pnlColor = (pnl: number) =>
    pnl > 0 ? colors.green : pnl < 0 ? colors.red : colors.muted;

  const resultColor = (result: string) => {
    switch (result) {
      case 'win':  return colors.green;
      case 'loss': return colors.red;
      case 'be':   return colors.amber;
      case 'open': return colors.blue;
      default:     return colors.muted;
    }
  };

  // ── Legacy selection handlers ─────────────────────────────────────────────
  const handleLegacyLongPress = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  };

  const handleLegacyPress = (id: string) => {
    if (!selectionMode) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) setSelectionMode(false);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds(new Set(filteredLegacyLogs.map((l) => l.id)));
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = () => {
    const count = selectedIds.size;
    Alert.alert(
      'Delete Legacy Entries',
      `Are you sure you want to delete ${count} legacy journal ${count === 1 ? 'entry' : 'entries'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await Promise.all(
              Array.from(selectedIds).map((id) => deleteJournalEntry(id))
            );
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSelectionMode(false);
            setSelectedIds(new Set());
            showToast(`${count} ${count === 1 ? 'entry' : 'entries'} deleted`);
            await loadAll();
          },
        },
      ]
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: Trades
  // ═══════════════════════════════════════════════════════════════════════════

  const renderTradeItem = ({ item }: { item: Trade }) => {
    const dirColor = item.dir === 'BUY' ? colors.green : colors.red;
    const rc       = resultColor(item.result);

    return (
      <TouchableOpacity
        style={styles.tradeCard}
        activeOpacity={0.8}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({
            pathname: '/screens/TradeDetailScreen',
            params: { id: item.id },
          });
        }}
      >
        <View style={styles.tradeCardLeft}>
          <View style={styles.tradeCardHeader}>
            <Text style={styles.tradePair}>{item.pair}</Text>
            <Text style={[styles.tradeDir, { color: dirColor }]}>{item.dir}</Text>
            <View style={[styles.resultBadge, { backgroundColor: rc + '22', borderColor: rc + '55' }]}>
              <Text style={[styles.resultText, { color: rc }]}>{item.result.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.tradeMeta}>
            {item.dateStr} · {item.session} · {item.strategy}
          </Text>
        </View>
        <View style={styles.tradeCardRight}>
          <Text style={[styles.tradePnl, { color: pnlColor(item.pnl) }]}>{formatCurrencyValue(item.pnl)}</Text>
          <Text style={styles.tradeScore}>{Math.round(item.ruleScore)}%</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderTradesTab = () => {
    if (sortedTrades.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>No trades yet</Text>
          <Text style={styles.emptySubtitle}>Log your first trade to start building your journal</Text>
        </View>
      );
    }
    return (
      <FlatList
        data={sortedTrades}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderTradeItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      />
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: Mental Log
  // ═══════════════════════════════════════════════════════════════════════════

  const renderQuoteStrip = () => (
    <View style={styles.quoteCard}>
      <Ionicons name="chatbubble-ellipses" size={13} color={accent} />
      <View style={{ flex: 1 }}>
        <Text style={styles.quoteText}>"{quote.text}"</Text>
        <Text style={styles.quoteAuthor}>— {quote.author}</Text>
      </View>
    </View>
  );

  const renderMentalLogItem = ({ item }: { item: MentalLog }) => {
    const cfg = MOOD_CONFIG[item.mood] ?? MOOD_CONFIG.neutral;
    return (
      <TouchableOpacity
        style={styles.mentalCard}
        activeOpacity={0.8}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({
            pathname: '/screens/MentalLogScreen',
            params: { date: item.id },
          });
        }}
      >
        <View style={styles.mentalCardHeader}>
          <Text style={styles.mentalEmoji}>{cfg.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.mentalDate}>{item.dateStr}</Text>
            <Text style={[styles.mentalMoodLabel, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <View style={styles.biasPill}>
            <Ionicons name={item.bias === 'bullish' ? 'trending-up' : item.bias === 'bearish' ? 'trending-down' : 'remove'} size={11} color={item.bias === 'bullish' ? colors.green : item.bias === 'bearish' ? colors.red : colors.muted} />
            <Text style={[styles.biasText, { color: item.bias === 'bullish' ? colors.green : item.bias === 'bearish' ? colors.red : colors.muted }]}>{item.bias.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.scoresRow}>
          {[
            { label: 'Focus',      value: item.focusLevel, color: colors.green },
            { label: 'Patience',   value: item.patience,   color: colors.blue  },
            { label: 'Confidence', value: item.confidence, color: colors.amber  },
          ].map((s) => (
            <View key={s.label} style={styles.scoreItem}>
              <Text style={styles.scoreLabel}>{s.label}</Text>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${(s.value / 10) * 100}%`, backgroundColor: s.color }]} />
              </View>
              <Text style={[styles.scoreValue, { color: s.color }]}>{s.value}</Text>
            </View>
          ))}
        </View>

        {item.intention ? (
          <Text style={styles.intentionText} numberOfLines={2}>
            💡 {item.intention}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderLegacyItem = ({ item }: { item: JournalEntry }) => {
    const cfg        = LEGACY_MOOD_MAP[item.mood] ?? LEGACY_MOOD_MAP.neutral;
    const isSelected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.legacyCard, isSelected && styles.legacyCardSelected]}
        activeOpacity={0.8}
        onPress={() => handleLegacyPress(item.id)}
        onLongPress={() => handleLegacyLongPress(item.id)}
        delayLongPress={400}
      >
        {selectionMode && (
          <View style={[styles.selectionCheck, isSelected && { backgroundColor: colors.red, borderColor: colors.red }]}>
            {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
        )}
        <View style={styles.legacyHeader}>
          <Text style={styles.legacyEmoji}>{cfg.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.legacyDate}>{item.dateStr}</Text>
            <Text style={[styles.legacyMood, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <View style={[styles.legacyBadge, { backgroundColor: colors.surface2 }]}>
            <Text style={styles.legacyBadgeText}>LEGACY</Text>
          </View>
        </View>
        <Text style={styles.legacyNote}>{item.note}</Text>
        {!selectionMode && <Text style={styles.legacyHint}>Hold to select & delete</Text>}
      </TouchableOpacity>
    );
  };

  const renderSelectionBar = () => {
    if (!selectionMode) return null;
    return (
      <View style={styles.selectionBar}>
        <TouchableOpacity style={styles.selectionBarBtn} onPress={handleCancelSelection}>
          <Ionicons name="close" size={18} color={colors.muted} />
          <Text style={styles.selectionBarBtnText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
        <View style={styles.selectionBarRight}>
          <TouchableOpacity style={styles.selectionBarBtn} onPress={handleSelectAll}>
            <Ionicons name="checkmark-done" size={16} color={accent} />
            <Text style={[styles.selectionBarBtnText, { color: accent }]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.selectionDeleteBtn, selectedIds.size === 0 && { opacity: 0.4 }]} onPress={handleDeleteSelected} disabled={selectedIds.size === 0}>
            <Ionicons name="trash" size={16} color="#fff" />
            <Text style={styles.selectionDeleteText}>Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderMentalTab = () => {
    const totalCount = filteredMentalLogs.length + filteredLegacyLogs.length;

    return (
      <View style={{ flex: 1 }}>
        {renderSelectionBar()}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
        >
          {!activeDate && renderQuoteStrip()}
          {!activeDate && <MoodGraph weekLogs={weekLogs} />}

          {/* Date Selector Bar */}
          <View style={styles.dateSelectorBar}>
            <View style={styles.dateSelectorLeft}>
              <Ionicons name="calendar" size={16} color={activeDate ? colors.green : colors.text} />
              <View>
                <Text style={styles.dateSelectorLabel}>SELECTED DATE</Text>
                <Text style={[styles.dateSelectorValue, activeDate && { color: colors.green }]}>
                  {activeDate ? getFormattedDateStr(activeDate) : 'All Time'}
                </Text>
              </View>
            </View>
            <View style={styles.dateSelectorRight}>
              {activeDate ? (
                <TouchableOpacity onPress={() => { setActiveDate(null); Haptics.selectionAsync(); }} style={styles.resetTodayBtn}>
                  <Text style={styles.resetTodayText}>Clear Filter</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => { setShowDatePicker(true); Haptics.selectionAsync(); }} style={styles.changeDateBtn}>
                  <Text style={styles.changeDateText}>Pick Day</Text>
                  <Ionicons name="chevron-forward" size={12} color={colors.text} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: accent }]}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push({
                pathname: '/screens/MentalLogScreen',
                params: { date: activeDate || 'today' },
              });
            }}
          >
            <Ionicons name="add-circle" size={20} color={colors.bg} />
            <Text style={styles.primaryButtonText}>
              {activeDate ? `Log Mindset for ${getFormattedDateStr(activeDate)}` : "Log Today's Mindset"}
            </Text>
          </TouchableOpacity>

          {filteredMentalLogs.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>MENTAL LOGS</Text>
              {filteredMentalLogs.map((log) => <View key={log.id}>{renderMentalLogItem({ item: log })}</View>)}
            </>
          )}

          {filteredLegacyLogs.length > 0 && (
            <>
              <View style={styles.legacySectionHeader}>
                <Text style={styles.sectionLabel}>PREVIOUS JOURNAL ENTRIES</Text>
                {!selectionMode && <Text style={styles.legacySectionHint}>Hold to delete</Text>}
              </View>
              {filteredLegacyLogs.map((entry) => <View key={entry.id}>{renderLegacyItem({ item: entry })}</View>)}
            </>
          )}

          {totalCount === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🧠</Text>
              <Text style={styles.emptyTitle}>No logs found</Text>
              <Text style={styles.emptySubtitle}>
                {activeDate ? `No mindset logged on ${getFormattedDateStr(activeDate)}.` : 'Start tracking your daily mindset and emotions.'}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: Notes
  // ═══════════════════════════════════════════════════════════════════════════

  const pinnedNotes  = notes.filter((n) => n.pinned);
  const regularNotes = notes.filter((n) => !n.pinned);

  const renderNoteCard = (note: Note) => {
    const catColor       = NOTE_CATEGORY_COLORS[note.category] ?? colors.muted;
    const checklistDone  = note.checklist.filter((c) => c.checked).length;
    const checklistTotal = note.checklist.length;

    return (
      <TouchableOpacity
        key={note.id}
        style={styles.noteCard}
        activeOpacity={0.8}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({ pathname: '/screens/NoteViewScreen', params: { id: note.id } });
        }}
      >
        <View style={styles.noteCardHeader}>
          {note.pinned && <Ionicons name="pin" size={12} color={accent} style={{ marginRight: 2 }} />}
          <Text style={styles.noteTitle} numberOfLines={1}>{note.title || 'Untitled'}</Text>
          <View style={[styles.catBadge, { backgroundColor: catColor + '22', borderColor: catColor + '44' }]}>
            <Text style={[styles.catBadgeText, { color: catColor }]}>{note.category.toUpperCase()}</Text>
          </View>
        </View>
        {note.content ? <Text style={styles.notePreview} numberOfLines={2}>{note.content}</Text> : null}
        {checklistTotal > 0 && (
          <View style={styles.checklistRow}>
            <Ionicons name="checkbox-outline" size={11} color={colors.muted} />
            <Text style={styles.checklistText}>{checklistDone}/{checklistTotal} completed</Text>
            <View style={styles.checkBarBg}>
              <View style={[styles.checkBarFill, { width: `${(checklistDone / checklistTotal) * 100}%`, backgroundColor: checklistDone === checklistTotal ? colors.green : colors.blue }]} />
            </View>
          </View>
        )}
        <Text style={styles.noteDate}>{note.dateStr}</Text>
      </TouchableOpacity>
    );
  };

  const renderNotesTab = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
    >
      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: accent }]}
        activeOpacity={0.85}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push({ pathname: '/screens/NoteDetailScreen', params: { id: 'new' } });
        }}
      >
        <Ionicons name="add-circle" size={20} color={colors.bg} />
        <Text style={styles.primaryButtonText}>New Note</Text>
      </TouchableOpacity>

      {notes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📝</Text>
          <Text style={styles.emptyTitle}>No notes yet</Text>
          <Text style={styles.emptySubtitle}>Create notes, checklists, and trading ideas</Text>
        </View>
      ) : (
        <>
          {pinnedNotes.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>📌 PINNED</Text>
              {pinnedNotes.map(renderNoteCard)}
            </>
          )}
          {regularNotes.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>RECENT</Text>
              {regularNotes.map(renderNoteCard)}
            </>
          )}
        </>
      )}
    </ScrollView>
  );

  const TABS: { key: TabKey; label: string; icon: string; count: number }[] = [
    { key: 'trades', label: 'Trades',     icon: '📊', count: sortedTrades.length },
    { key: 'mental', label: 'Mental Log', icon: '🧠', count: filteredMentalLogs.length + filteredLegacyLogs.length },
    { key: 'notes',  label: 'Notes',      icon: '📝', count: notes.length },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerBadge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
            <Text style={[styles.headerBadgeText, { color: accent }]}>JOURNAL</Text>
          </View>
          <Text style={styles.headerTitle}>My Journal</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.countBadge}>
            <Text style={[styles.countNum, { color: accent }]}>{sortedTrades.length}</Text>
            <Text style={styles.countLabel}>TRADES</Text>
          </View>
        </View>
      </View>

      {/* Tab switcher */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, isActive && { backgroundColor: accent + '18', borderColor: accent + '55' }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab(tab.key);
                setSelectionMode(false);
                setSelectedIds(new Set());
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, isActive && { color: accent }]}>{tab.label}</Text>
              {tab.count > 0 && (
                <View style={[styles.tabCount, isActive && { backgroundColor: accent }]}>
                  <Text style={[styles.tabCountText, isActive && { color: colors.bg }]}>{tab.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'trades' && renderTradesTab()}
        {activeTab === 'mental' && renderMentalTab()}
        {activeTab === 'notes'  && renderNotesTab()}
      </View>

      <DatePickerModal
        visible={showDatePicker}
        currentDateId={activeDate || todayId()}
        loggedDates={loggedDates}
        onSelect={(dateId) => {
          setActiveDate(dateId);
          setShowDatePicker(false);
        }}
        onClose={() => setShowDatePicker(false)}
      />

      <Toast message={toastMsg} visible={toastVisible} />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: colors.bg,
  },

  // ── Header ──
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop:        spacing.md,
    paddingBottom:     spacing.sm,
  },
  headerLeft: { flex: 1 },
  headerBadge: {
    borderWidth:       1,
    borderRadius:      radius.pill,
    paddingHorizontal: 10,
    paddingVertical:   3,
    alignSelf:         'flex-start',
    marginBottom:      spacing.xs,
  },
  headerBadgeText: { fontFamily: font.mono, fontSize: 8, letterSpacing: 1.5 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: 0.5 },
  headerRight: { alignItems: 'center' },
  countBadge: {
    backgroundColor:   colors.surface,
    borderWidth:       0.5,
    borderColor:       colors.border,
    borderRadius:      radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    alignItems:        'center',
  },
  countNum: { fontFamily: font.mono, fontSize: 20, fontWeight: '800' },
  countLabel: { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1, marginTop: 2 },

  // ── Tab bar ──
  tabBar: {
    flexDirection:     'row',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xs,
    gap:               spacing.xs,
  },
  tabBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             4,
    paddingVertical: spacing.sm,
    borderRadius:    radius.md,
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
  },
  tabIcon:  { fontSize: 12 },
  tabLabel: { fontSize: 11, fontWeight: '600', color: colors.muted },
  tabCount: {
    minWidth:          16,
    height:            16,
    borderRadius:      8,
    backgroundColor:   colors.surface2,
    justifyContent:    'center',
    alignItems:        'center',
    paddingHorizontal: 3,
  },
  tabCountText: { fontSize: 8, fontWeight: '700', color: colors.muted, fontFamily: font.mono },

  // ── Date Selector Bar ──
  dateSelectorBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dateSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dateSelectorLabel: {
    fontFamily: font.mono,
    fontSize: 8,
    color: colors.muted,
    letterSpacing: 1.5,
  },
  dateSelectorValue: {
    fontFamily: font.mono,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  dateSelectorRight: {},
  changeDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  changeDateText: {
    fontFamily: font.mono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.text,
  },
  resetTodayBtn: {
    backgroundColor: colors.surface2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  resetTodayText: {
    fontFamily: font.mono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
  },

  // ── List content ──
  listContent: {
    padding:       spacing.lg,
    paddingBottom: 120,
  },

  // ── Trade cards ──
  tradeCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.sm,
  },
  tradeCardLeft:   { flex: 1 },
  tradeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 },
  tradePair: { fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: 0.3 },
  tradeDir: { fontSize: 11, fontWeight: '700', fontFamily: font.mono },
  resultBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.sm, borderWidth: 1 },
  resultText: { fontSize: 8, fontWeight: '700', fontFamily: font.mono, letterSpacing: 0.5 },
  tradeMeta: { fontSize: 10, color: colors.muted, fontFamily: font.mono },
  tradeCardRight: { alignItems: 'flex-end', gap: 2 },
  tradePnl: { fontSize: 15, fontWeight: '800', fontFamily: font.mono },
  tradeScore: { fontSize: 10, color: colors.muted, fontFamily: font.mono },

  // ── Mental log cards ──
  mentalCard: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.sm,
  },
  mentalCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  mentalEmoji:   { fontSize: 28 },
  mentalDate: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 2 },
  mentalMoodLabel: { fontSize: 11, fontWeight: '600', fontFamily: font.mono },
  biasPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 0.5, borderColor: colors.border },
  biasText: { fontSize: 8, fontWeight: '700', fontFamily: font.mono, letterSpacing: 0.5 },
  scoresRow: { gap: spacing.xs, marginBottom: spacing.sm },
  scoreItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scoreLabel: { width: 72, fontSize: 10, color: colors.muted, fontFamily: font.mono },
  barBg: { flex: 1, height: 5, backgroundColor: colors.surface2, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  scoreValue: { width: 20, fontSize: 11, fontWeight: '700', fontFamily: font.mono, textAlign: 'right' },
  intentionText: { fontSize: 11, color: colors.muted, fontStyle: 'italic', lineHeight: 16 },

  // ── Legacy cards ──
  legacyCard: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.sm,
    opacity:         0.85,
    position:        'relative',
  },
  legacyCardSelected: { borderColor: colors.red + '88', backgroundColor: colors.red + '08', opacity: 1 },
  legacyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  legacyEmoji: { fontSize: 24 },
  legacyDate: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 2 },
  legacyMood: { fontSize: 10, fontFamily: font.mono },
  legacyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 0.5, borderColor: colors.border },
  legacyBadgeText: { fontSize: 7, fontWeight: '700', fontFamily: font.mono, color: colors.muted, letterSpacing: 1 },
  legacyNote: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  legacyHint: { fontSize: 9, color: colors.muted, fontFamily: font.mono, marginTop: spacing.xs, opacity: 0.5 },
  legacySectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, marginTop: 4 },
  legacySectionHint: { fontSize: 9, color: colors.muted, fontFamily: font.mono, opacity: 0.5 },

  // ── Selection checkbox ──
  selectionCheck: { position: 'absolute', top: spacing.sm, right: spacing.sm, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface2, justifyContent: 'center', alignItems: 'center', zIndex: 10 },

  // ── Selection action bar ──
  selectionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  selectionBarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  selectionBarBtnText: { fontFamily: font.mono, fontSize: 11, color: colors.muted, fontWeight: '600' },
  selectionCount: { fontFamily: font.mono, fontSize: 12, fontWeight: '700', color: colors.text },
  selectionBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  selectionDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.red, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.sm },
  selectionDeleteText: { fontFamily: font.mono, fontSize: 11, fontWeight: '700', color: '#fff' },

  // ── Graph ──
  graphCard: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.lg,
  },
  graphMetricLabel: {
    fontSize:     10,
    fontWeight:   '600',
    fontFamily:   font.mono,
    marginBottom: 4,
  },
  graphValueLabel: {
    position:   'absolute',
    fontSize:   8,
    fontWeight: '700',
    fontFamily: font.mono,
    textAlign:  'center',
    width:      16,
  },
  graphDayRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginTop:      spacing.sm,
  },
  graphDayLabel: {
    fontSize:   9,
    color:      colors.muted,
    fontFamily: font.mono,
  },
  graphMoodRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginTop:      4,
  },
  graphMoodEmoji: { fontSize: 14 },

  // ── Quote ──
  quoteCard: {
    flexDirection:   'row',
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.md,
    gap:             spacing.sm,
    alignItems:      'flex-start',
  },
  quoteText: { color: colors.text, fontSize: 12, fontStyle: 'italic', lineHeight: 18, marginBottom: 4 },
  quoteAuthor: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 0.5 },

  // ── Primary button ──
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  primaryButtonText: { fontSize: 14, fontWeight: '700', color: colors.bg, fontFamily: font.mono },

  // ── Section label ──
  sectionLabel: { fontSize: 9, fontWeight: '700', color: colors.muted, fontFamily: font.mono, letterSpacing: 1.5, marginBottom: spacing.sm, marginTop: 4 },

  // ── Notes ──
  noteCard: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.sm,
  },
  noteCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  noteTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  catBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1 },
  catBadgeText: { fontSize: 8, fontWeight: '700', fontFamily: font.mono, letterSpacing: 0.5 },
  notePreview: { fontSize: 12, color: colors.muted, lineHeight: 18, marginBottom: spacing.xs },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  checklistText: { fontSize: 10, color: colors.muted, fontFamily: font.mono },
  checkBarBg: { flex: 1, height: 4, backgroundColor: colors.surface2, borderRadius: 2, overflow: 'hidden' },
  checkBarFill: { height: 4, borderRadius: 2 },
  noteDate: { fontSize: 10, color: colors.muted, fontFamily: font.mono },

  // ── Empty state ──
  emptyContainer: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  emptySubtitle: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});