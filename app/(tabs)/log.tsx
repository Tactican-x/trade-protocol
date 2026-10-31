import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Animated,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { colors, font, spacing, radius } from '../theme';
import {
  CheckItem,
  GroupLabel,
  PhaseHeader,
  QuoteBlock,
  IdentityBlock,
  WarnBlock,
  PrimaryButton,
  GhostButton,
  Toast,
} from '../components/UI';
import { LiveDisciplineMeter } from '../components/LiveDisciplineMeter';
import { InterventionModal } from '../components/InterventionModal';
import { addTrade, loadTrades, Trade } from '../store/trades';
import { PRO_RULES, getRulesForMode } from '../store/rules';
import {
  analyzeIntervention,
  InterventionResult,
} from '../store/interventionEngine';

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

// ─────────────────────────────────────────────────────────────────────────────
// Date Helpers (Production Safe)
// ─────────────────────────────────────────────────────────────────────────────

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function toDateId(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseDateId(id: string): Date {
  if (!id || typeof id !== 'string') return new Date();
  const parts = id.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
function todayId(): string {
  return toDateId(new Date());
}
function isFutureId(id: string): boolean {
  return id > todayId();
}
function formatBannerDate(id: string): string {
  try {
    return format(parseDateId(id), 'EEE, dd MMM yyyy');
  } catch {
    return id;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule Groups — Full Mode (25 rules)
// ─────────────────────────────────────────────────────────────────────────────

const BEFORE_MARKET = [
  'Trend identified (up/down/range)',
  'Trading with trend or valid setup',
  'Price at key zone (S/R or supply-demand)',
];
const BEFORE_SETUP = [
  'Clear setup - not guessing',
  'Confirmation present (rejection, structure break)',
  'Trade based on system - not feelings',
];
const BEFORE_RISK = [
  'Lot size calculated correctly',
  'Risk is fixed and defined',
  'SL placed at a logical level',
  'TP realistic (minimum 1:2 RR)',
];
const BEFORE_MENTAL = [
  'Was calm before entry',
  'Okay with losing this trade',
];

const DURING_NOT = [
  'Did not move SL',
  'Did not move TP',
  'Did not close early out of fear',
  'Did not watch every tick emotionally',
  'Did not add to a losing position',
];
const DURING_DID = [
  'Let the trade play out fully',
  'Accepted the outcome',
  'Stayed calm throughout',
];

const AFTER_TRADE = [
  'Followed my rules',
  'Entry was valid',
  'SL was placed correctly',
  'TP was logical',
];

const ALL_RULES_FULL = [
  ...BEFORE_MARKET,
  ...BEFORE_SETUP,
  ...BEFORE_RISK,
  ...BEFORE_MENTAL,
  ...DURING_NOT,
  ...DURING_DID,
  ...AFTER_TRADE,
];

const TOTAL_FULL = ALL_RULES_FULL.length; // 25

// ─────────────────────────────────────────────────────────────────────────────
// Pro Mode — 10 Core Rules
// ─────────────────────────────────────────────────────────────────────────────

const PRO_BEFORE = [
  'Trend identified (up/down/range)',
  'Price at key zone (S/R or supply-demand)',
  'Clear setup - not guessing',
  'Confirmation present (rejection, structure break)',
  'Lot size calculated correctly',
  'Risk is fixed and defined',
  'SL placed at a logical level',
  'Was calm before entry',
];

const PRO_DURING = [
  'Did not move SL',
];

const PRO_AFTER = [
  'Followed my rules',
];

const ALL_RULES_PRO = [
  ...PRO_BEFORE,
  ...PRO_DURING,
  ...PRO_AFTER,
];

const TOTAL_PRO = ALL_RULES_PRO.length; // 10

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

type ChecklistMode = 'pro' | 'full';

const STRATEGIES = [
  'Supply & Demand', 'Support & Resistance', 'Trend Following',
  'Breakout', 'Reversal', 'Scalp', 'ICT Order Flow', 'Price Action', 'Other',
];
const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
const SESSIONS   = ['London', 'New York', 'Asian', 'Overlap', 'Other'];

type Phase = 0 | 1 | 2 | 3;

const PHASE_CONFIG_FULL = [
  { label: 'Before',  dot: colors.green, accentColor: colors.green },
  { label: 'During',  dot: colors.blue,  accentColor: colors.blue  },
  { label: 'After',   dot: colors.red,   accentColor: colors.red   },
  { label: 'Details', dot: colors.amber, accentColor: colors.amber },
];

const PHASE_CONFIG_PRO = [
  { label: 'Checklist', dot: colors.green, accentColor: colors.green },
  { label: 'Details',   dot: colors.amber, accentColor: colors.amber },
];

const RESULTS: {
  key: 'win' | 'loss' | 'be' | 'open';
  label: string;
  color: string;
  icon: string;
}[] = [
  { key: 'win',  label: 'WIN',  color: colors.green, icon: 'trending-up'   },
  { key: 'loss', label: 'LOSS', color: colors.red,   icon: 'trending-down' },
  { key: 'be',   label: 'B/E',  color: colors.amber, icon: 'remove'        },
  { key: 'open', label: 'OPEN', color: colors.blue,  icon: 'time'          },
];

// ─────────────────────────────────────────────────────────────────────────────
// Date Picker Modal
// ─────────────────────────────────────────────────────────────────────────────

function DatePickerModal({
  visible, currentDateId, tradeDatesMap, onSelect, onClose,
}: {
  visible:       boolean;
  currentDateId: string;
  tradeDatesMap: Map<string, { count: number; pnl: number }>;
  onSelect:      (id: string) => void;
  onClose:       () => void;
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

  const monthName = format(viewMonth, 'MMMM yyyy');
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDay    = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const today       = todayId();

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
      <TouchableOpacity style={pickerModalStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={pickerModalStyles.sheet} onPress={() => {}}>
          <View style={pickerModalStyles.header}>
            <TouchableOpacity onPress={goPrevMonth} style={pickerModalStyles.navBtn}>
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </TouchableOpacity>
            <Text style={pickerModalStyles.monthText}>{monthName}</Text>
            <TouchableOpacity
              onPress={goNextMonth}
              style={[pickerModalStyles.navBtn, !canGoNext && { opacity: 0.3 }]}
              disabled={!canGoNext}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={pickerModalStyles.weekHeader}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <Text key={i} style={pickerModalStyles.weekDay}>{d}</Text>
            ))}
          </View>

          <View style={pickerModalStyles.grid}>
            {cells.map((day, i) => {
              if (day === null) return <View key={i} style={pickerModalStyles.cell} />;
              const dateId = toDateId(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
              const isSelected   = dateId === currentDateId;
              const isTodayCell  = dateId === today;
              const isFutureCell = dateId > today;
              const dayTradeInfo = tradeDatesMap.get(dateId);

              const dotColor = dayTradeInfo 
                ? (dayTradeInfo.pnl > 0 ? colors.green : dayTradeInfo.pnl < 0 ? colors.red : colors.blue)
                : null;

              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    pickerModalStyles.cell,
                    isSelected && { backgroundColor: colors.blue + '33', borderColor: colors.blue },
                    isTodayCell && !isSelected && { borderColor: colors.green + '88' },
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
                  <Text style={[
                    pickerModalStyles.dayNum,
                    isSelected && { color: colors.blue, fontWeight: '800' },
                    isTodayCell && !isSelected && { color: colors.green },
                  ]}>{day}</Text>
                  {dotColor && <View style={[pickerModalStyles.dot, { backgroundColor: dotColor }]} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={pickerModalStyles.legend}>
            <View style={pickerModalStyles.legendItem}>
              <View style={[pickerModalStyles.dot, { backgroundColor: colors.green }]} />
              <Text style={pickerModalStyles.legendText}>Win Day</Text>
              <View style={[pickerModalStyles.dot, { backgroundColor: colors.red, marginLeft: 8 }]} />
              <Text style={pickerModalStyles.legendText}>Loss Day</Text>
            </View>
            <TouchableOpacity onPress={() => { onSelect(today); Haptics.selectionAsync(); }}>
              <Text style={[pickerModalStyles.legendText, { color: colors.blue }]}>Select Today</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const pickerModalStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 20 },
  sheet:      { backgroundColor: colors.bg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn:     { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  monthText:  { fontSize: 14, fontWeight: '800', color: colors.text },
  weekHeader: { flexDirection: 'row', marginBottom: 6 },
  weekDay:    { flex: 1, textAlign: 'center', fontSize: 10, color: colors.muted, fontFamily: font.mono, fontWeight: '700' },
  grid:       { flexDirection: 'row', flexWrap: 'wrap' },
  cell:       { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 8 },
  dayNum:     { fontSize: 12, color: colors.text, fontFamily: font.mono },
  dot:        { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  legend:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 10, color: colors.muted, fontFamily: font.mono },
});

// ─────────────────────────────────────────────────────────────────────────────
// Dark Picker & Dark TextInput
// ─────────────────────────────────────────────────────────────────────────────

interface DarkPickerProps {
  label:         string;
  selectedValue: string;
  onValueChange: (v: string) => void;
  items:         string[];
  accentColor?:  string;
}

function DarkPicker({
  label, selectedValue, onValueChange, items, accentColor = colors.muted,
}: DarkPickerProps) {
  return (
    <View style={pickerStyles.wrapper}>
      <Text style={pickerStyles.label}>{label}</Text>
      <View style={pickerStyles.container}>
        <View style={pickerStyles.accentBar} />
        <View style={pickerStyles.inner}>
          <Picker
            selectedValue={selectedValue}
            onValueChange={onValueChange}
            style={pickerStyles.picker}
            dropdownIconColor={colors.muted}
            mode="dropdown"
          >
            {items.map((item) => (
              <Picker.Item
                key={item} label={item} value={item}
                color={colors.text}
                style={{ backgroundColor: colors.surface2 }}
              />
            ))}
          </Picker>
        </View>
        <View style={[pickerStyles.selectedIndicator, { borderColor: accentColor + '44' }]}>
          <Text style={[pickerStyles.selectedText, { color: accentColor }]}>
            {selectedValue}
          </Text>
          <Ionicons name="chevron-down" size={12} color={accentColor} />
        </View>
      </View>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  wrapper:           { marginBottom: spacing.sm },
  label:             { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  container:         { backgroundColor: colors.surface2, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden', position: 'relative' },
  accentBar:         { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, backgroundColor: colors.border2, zIndex: 1 },
  inner:             { opacity: 0, height: 44, position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 2 },
  selectedIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 0 },
  selectedText:      { fontFamily: font.mono, fontSize: 13, fontWeight: '600' },
  picker:            { color: colors.text, height: 44, backgroundColor: colors.surface2 },
});

interface DarkInputProps {
  label:           string;
  value:           string;
  onChangeText:    (v: string) => void;
  placeholder?:    string;
  keyboardType?:   'default' | 'numeric' | 'decimal-pad';
  autoCapitalize?: 'none' | 'characters' | 'words' | 'sentences';
  multiline?:      boolean;
  numberOfLines?:  number;
  accentColor?:    string;
  hint?:           string;
}

function DarkInput({
  label, value, onChangeText, placeholder = '', keyboardType = 'default',
  autoCapitalize = 'none', multiline = false, numberOfLines = 1,
  accentColor = colors.muted, hint,
}: DarkInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={inputStyles.wrapper}>
      <View style={inputStyles.labelRow}>
        <Text style={inputStyles.label}>{label}</Text>
        {hint && <Text style={inputStyles.hint}>{hint}</Text>}
      </View>
      <View style={[
        inputStyles.container,
        focused && { borderColor: accentColor + '88', backgroundColor: colors.surface },
      ]}>
        <View style={[inputStyles.accentBar, { backgroundColor: focused ? accentColor : colors.border2 }]} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          numberOfLines={multiline ? numberOfLines : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            inputStyles.input,
            multiline && { minHeight: numberOfLines * 36, textAlignVertical: 'top' },
          ]}
        />
      </View>
    </View>
  );
}

const inputStyles = StyleSheet.create({
  wrapper:   { marginBottom: spacing.sm },
  labelRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label:     { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, textTransform: 'uppercase' },
  hint:      { fontFamily: font.mono, fontSize: 9, color: colors.muted, opacity: 0.6 },
  container: { backgroundColor: colors.surface2, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden', flexDirection: 'row', alignItems: 'stretch' },
  accentBar: { width: 2, backgroundColor: colors.border2 },
  input:     { flex: 1, color: colors.text, fontSize: 13, fontFamily: font.mono, paddingHorizontal: spacing.md, paddingVertical: 11 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Direction Toggle & Helpers
// ─────────────────────────────────────────────────────────────────────────────

function DirToggle({ value, onChange }: { value: 'BUY' | 'SELL'; onChange: (v: 'BUY' | 'SELL') => void }) {
  return (
    <View style={dirStyles.wrapper}>
      <Text style={dirStyles.label}>DIRECTION</Text>
      <View style={dirStyles.row}>
        <TouchableOpacity
          onPress={() => onChange('BUY')}
          style={[
            dirStyles.btn,
            value === 'BUY' && { backgroundColor: colors.green + '22', borderColor: colors.green },
          ]}
        >
          <Ionicons name="trending-up" size={14} color={value === 'BUY' ? colors.green : colors.muted} />
          <Text style={[dirStyles.btnText, { color: value === 'BUY' ? colors.green : colors.muted }]}>
            BUY
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onChange('SELL')}
          style={[
            dirStyles.btn,
            value === 'SELL' && { backgroundColor: colors.red + '22', borderColor: colors.red },
          ]}
        >
          <Ionicons name="trending-down" size={14} color={value === 'SELL' ? colors.red : colors.muted} />
          <Text style={[dirStyles.btnText, { color: value === 'SELL' ? colors.red : colors.muted }]}>
            SELL
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const dirStyles = StyleSheet.create({
  wrapper: { marginBottom: spacing.sm },
  label:   { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: 6 },
  row:     { flexDirection: 'row', gap: spacing.sm },
  btn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: radius.sm, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface2 },
  btnText: { fontFamily: font.mono, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
});

function SectionDivider({ label }: { label: string }) {
  return (
    <View style={sdStyles.row}>
      <View style={sdStyles.line} />
      <Text style={sdStyles.label}>{label}</Text>
      <View style={sdStyles.line} />
    </View>
  );
}
const sdStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md },
  line:  { flex: 1, height: 0.5, backgroundColor: colors.border },
  label: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginHorizontal: spacing.sm },
});

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={miniStyles.card}>
      <Text style={[miniStyles.value, { color }]}>{value || '—'}</Text>
      <Text style={miniStyles.label}>{label}</Text>
    </View>
  );
}
const miniStyles = StyleSheet.create({
  card:  { flex: 1, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center' },
  value: { fontFamily: font.mono, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  label: { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1, textTransform: 'uppercase' },
});

function PreEntryBanner({ recentTrades, onDismiss }: { recentTrades: Trade[]; onDismiss: () => void }) {
  let streak = 0;
  for (const t of recentTrades) {
    if (t.result === 'loss') streak++;
    else break;
  }

  const todayCount = recentTrades.filter((t) => {
    const d   = new Date(t.timestamp);
    const now = new Date();
    return (
      d.getDate()     === now.getDate()     &&
      d.getMonth()    === now.getMonth()    &&
      d.getFullYear() === now.getFullYear()
    );
  }).length;

  const warnings: { icon: string; text: string; color: string }[] = [];

  if (streak >= 2) {
    warnings.push({
      icon:  'trending-down',
      text:  `You are on a ${streak}-trade losing streak. Consider taking a break.`,
      color: colors.red,
    });
  }

  if (todayCount >= 5) {
    warnings.push({
      icon:  'flash',
      text:  `You have logged ${todayCount} trades today. Overtrading risk is high.`,
      color: colors.amber,
    });
  }

  if (warnings.length === 0) return null;

  return (
    <View style={bannerStyles.container}>
      <View style={bannerStyles.header}>
        <Ionicons name="shield-half" size={14} color={colors.red} />
        <Text style={bannerStyles.title}>PRE-ENTRY CHECK</Text>
        <TouchableOpacity onPress={onDismiss} style={bannerStyles.dismiss}>
          <Ionicons name="close" size={14} color={colors.muted} />
        </TouchableOpacity>
      </View>
      {warnings.map((w, i) => (
        <View key={i} style={bannerStyles.row}>
          <Ionicons name={w.icon as any} size={12} color={w.color} />
          <Text style={[bannerStyles.text, { color: w.color }]}>{w.text}</Text>
        </View>
      ))}
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container: { backgroundColor: colors.red + '11', borderWidth: 1, borderColor: colors.red + '44', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  header:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  title:     { fontFamily: font.mono, fontSize: 9, color: colors.red, letterSpacing: 1.5, flex: 1 },
  dismiss:   { padding: 2 },
  row:       { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: 4 },
  text:      { flex: 1, fontFamily: font.mono, fontSize: 11, lineHeight: 16 },
});

function DisciplineLockedBadge({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      opacity.setValue(0);
      scale.setValue(0.8);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[lockedStyles.container, { opacity, transform: [{ scale }] }]}>
      <View style={lockedStyles.glow} />
      <View style={lockedStyles.inner}>
        <Ionicons name="lock-closed" size={16} color={colors.green} />
        <Text style={lockedStyles.text}>DISCIPLINE LOCKED</Text>
        <Text style={lockedStyles.emoji}>🔒</Text>
      </View>
      <Text style={lockedStyles.sub}>All core rules verified — you are cleared to trade</Text>
    </Animated.View>
  );
}

const lockedStyles = StyleSheet.create({
  container: { backgroundColor: colors.green + '12', borderWidth: 1.5, borderColor: colors.green + '55', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, overflow: 'hidden' },
  glow: { position: 'absolute', top: -20, left: -20, right: -20, height: 60, backgroundColor: colors.green + '08', borderRadius: 40 },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  text: { fontFamily: font.mono, fontSize: 12, fontWeight: '800', color: colors.green, letterSpacing: 2 },
  emoji: { fontSize: 14 },
  sub: { fontFamily: font.mono, fontSize: 10, color: colors.green, opacity: 0.7, textAlign: 'center' },
});

function ModeSwitcher({ mode, onSwitch }: { mode: ChecklistMode; onSwitch: (m: ChecklistMode) => void }) {
  return (
    <View style={modeStyles.container}>
      <TouchableOpacity
        style={[modeStyles.btn, mode === 'pro' && modeStyles.btnActivePro]}
        onPress={() => { onSwitch('pro'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        activeOpacity={0.7}
      >
        <Ionicons name="flash" size={14} color={mode === 'pro' ? colors.green : colors.muted} />
        <Text style={[modeStyles.btnText, mode === 'pro' && { color: colors.green }]}>PRO</Text>
        <Text style={[modeStyles.btnCount, mode === 'pro' && { color: colors.green, backgroundColor: colors.green + '22' }]}>10</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[modeStyles.btn, mode === 'full' && modeStyles.btnActiveFull]}
        onPress={() => { onSwitch('full'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        activeOpacity={0.7}
      >
        <Ionicons name="list" size={14} color={mode === 'full' ? colors.blue : colors.muted} />
        <Text style={[modeStyles.btnText, mode === 'full' && { color: colors.blue }]}>FULL</Text>
        <Text style={[modeStyles.btnCount, mode === 'full' && { color: colors.blue, backgroundColor: colors.blue + '22' }]}>25</Text>
      </TouchableOpacity>
    </View>
  );
}

const modeStyles = StyleSheet.create({
  container: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm + 2, borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface2 },
  btnActivePro: { backgroundColor: colors.green + '12', borderColor: colors.green + '55', borderWidth: 1 },
  btnActiveFull: { backgroundColor: colors.blue + '12', borderColor: colors.blue + '55', borderWidth: 1 },
  btnText: { fontFamily: font.mono, fontSize: 12, fontWeight: '700', color: colors.muted, letterSpacing: 1 },
  btnCount: { fontFamily: font.mono, fontSize: 9, fontWeight: '700', color: colors.muted, backgroundColor: colors.surface, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════

export default function LogTradeScreen() {
  const router = useRouter();

  // ── Read or Manage Selected Date ──────────────────────────────────────────
  const rawParams = useLocalSearchParams<{ date?: string }>();
  const dateParam = Array.isArray(rawParams.date) ? rawParams.date[0] : rawParams.date;

  const [selectedDateId, setSelectedDateId] = useState<string>(() => {
    if (!dateParam || dateParam === 'today') return todayId();
    if (isFutureId(dateParam)) return todayId();
    return dateParam;
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [allTrades, setAllTrades]           = useState<Trade[]>([]);

  // ── Multi-Currency & Cent State ───────────────────────────────────────────
  const [currencyCode, setCurrencyCode]   = useState('USD');
  const [isCentAccount, setIsCentAccount] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (dateParam && typeof dateParam === 'string') {
        if (!isFutureId(dateParam)) setSelectedDateId(dateParam);
      }

      // Load preferences and trade history
      Promise.all([
        AsyncStorage.getItem('@currency'),
        AsyncStorage.getItem('@is_cent_account'),
        loadTrades(),
      ]).then(([storedCur, storedCent, trades]) => {
        setCurrencyCode(storedCur || 'USD');
        setIsCentAccount(storedCent === 'true');
        setAllTrades(trades);
        setRecentTrades(trades.slice(0, 20));
        setShowBanner(true);
      });
    }, [dateParam])
  );

  const currencySymbol = useMemo(() => {
    return CURRENCY_SYMBOLS[currencyCode] || '$';
  }, [currencyCode]);

  const isBackfilled = selectedDateId !== todayId();

  const tradeDatesMap = useMemo(() => {
    const map = new Map<string, { count: number; pnl: number }>();
    for (const t of allTrades) {
      const dateId = toDateId(new Date(t.timestamp));
      const existing = map.get(dateId) || { count: 0, pnl: 0 };
      map.set(dateId, { count: existing.count + 1, pnl: existing.pnl + (t.pnl || 0) });
    }
    return map;
  }, [allTrades]);

  // ── Form State ────────────────────────────────────────────────────────────
  const [mode, setMode]           = useState<ChecklistMode>('pro');
  const [phase, setPhase]         = useState<Phase>(0);
  const [checked, setChecked]     = useState<Record<string, boolean>>({});
  const [pair, setPair]           = useState('');
  const [dir, setDir]             = useState<'BUY' | 'SELL'>('BUY');
  const [entry, setEntry]         = useState('');
  const [lot, setLot]             = useState('');
  const [sl, setSl]               = useState('');
  const [tp, setTp]               = useState('');
  const [pnl, setPnl]             = useState('');
  const [pnlSign, setPnlSign]     = useState<'profit' | 'loss'>('profit');
  const [session, setSession]     = useState('London');
  const [strategy, setStrategy]   = useState('Supply & Demand');
  const [timeframe, setTimeframe] = useState('H1');
  const [result, setResult]       = useState<'win' | 'loss' | 'be' | 'open' | null>(null);
  const [setup, setSetup]         = useState('');
  const [emotions, setEmotions]   = useState('');
  const [mistakes, setMistakes]   = useState('');
  const [lesson, setLesson]       = useState('');

  // ── UI State ──────────────────────────────────────────────────────────────
  const [toastMsg, setToastMsg]         = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastKey = useRef(0);

  // ── Intervention ──────────────────────────────────────────────────────────
  const [recentTrades, setRecentTrades]             = useState<Trade[]>([]);
  const [showBanner, setShowBanner]                 = useState(true);
  const [interventionVisible, setInterventionVisible] = useState(false);
  const [interventionResult, setInterventionResult]   = useState<InterventionResult | null>(null);
  const pendingSaveRef = useRef(false);

  // ── Derived Values ────────────────────────────────────────────────────────
  const activeRules = mode === 'pro' ? ALL_RULES_PRO : ALL_RULES_FULL;
  const totalRules  = mode === 'pro' ? TOTAL_PRO     : TOTAL_FULL;
  const totalTicked = activeRules.filter((r) => checked[r]).length;
  const progressPct = Math.round((totalTicked / totalRules) * 100);
  const isProComplete = mode === 'pro' && totalTicked === TOTAL_PRO;

  const beforeRulesFull  = [...BEFORE_MARKET, ...BEFORE_SETUP, ...BEFORE_RISK, ...BEFORE_MENTAL];
  const beforeTickedFull = beforeRulesFull.filter((r) => checked[r]).length;
  const showWarn         = mode === 'full' && beforeTickedFull > 0 && beforeTickedFull < beforeRulesFull.length;

  const phaseConfig  = mode === 'pro' ? PHASE_CONFIG_PRO  : PHASE_CONFIG_FULL;
  const maxPhase     = phaseConfig.length - 1;
  const effectivePhase = Math.min(phase, maxPhase) as Phase;

  function getActualPnl(): number {
    const raw = parseFloat(pnl) || 0;
    return pnlSign === 'loss' ? -Math.abs(raw) : Math.abs(raw);
  }

  function buildTradeDate(): Date {
    const base = parseDateId(selectedDateId);
    const now = new Date();
    base.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    if (base.getTime() > Date.now()) return new Date();
    return base;
  }

  function showToast(msg: string) {
    toastKey.current += 1;
    setToastMsg(msg);
    setToastVisible(false);
    setTimeout(() => setToastVisible(true), 50);
  }

  function toggle(rule: string) {
    setChecked((prev) => ({ ...prev, [rule]: !prev[rule] }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleModeSwitch(newMode: ChecklistMode) {
    setMode(newMode);
    setPhase(0);
  }

  async function executeSave() {
    const followedRules = activeRules.filter((r) => checked[r]);
    const ruleScore     = Math.round((followedRules.length / totalRules) * 100);
    const actualPnl     = getActualPnl();
    const tradeDate     = buildTradeDate();

    await addTrade({
      id:        Date.now(),
      mode,
      pair:      pair.toUpperCase().trim(),
      dir,
      entry,
      lot,
      sl,
      tp,
      pnl:       actualPnl,
      session,
      result:    result!,
      strategy,
      timeframe,
      rules:     followedRules,
      ruleScore,
      emotions,
      mistakes,
      lesson,
      setup,
      timestamp: tradeDate.toISOString(),
      dateStr:   format(tradeDate, 'd MMM yyyy'),
      timeStr:   format(tradeDate, 'HH:mm'),
      tags:      [],
    });

    const dayLabel = format(tradeDate, 'd MMM yyyy');
    showToast(
      isBackfilled
        ? `✓ Trade logged for ${dayLabel}`
        : `Trade logged at ${format(tradeDate, 'HH:mm')}`
    );
    resetAll();
    setTimeout(() => router.push('/(tabs)/history'), 800);
  }

  async function handleSave() {
    if (!pair.trim()) {
      Alert.alert('Missing Field', 'Please enter a trading pair.');
      return;
    }
    if (!result) {
      Alert.alert('Missing Field', 'Please select a trade result.');
      return;
    }

    const followedRules = activeRules.filter((r) => checked[r]);
    const ruleScore     = Math.round((followedRules.length / totalRules) * 100);

    const intervention = analyzeIntervention({
      ruleScore,
      checkedCount: totalTicked,
      totalRules,
      emotions,
      recentTrades,
      session,
    });

    if (intervention.shouldIntervene) {
      setInterventionResult(intervention);
      setInterventionVisible(true);
      pendingSaveRef.current = true;
      return;
    }

    await executeSave();
  }

  const handleInterventionProceed = async () => {
    setInterventionVisible(false);
    setInterventionResult(null);
    if (pendingSaveRef.current) {
      pendingSaveRef.current = false;
      await executeSave();
    }
  };

  const handleInterventionReview = () => {
    setInterventionVisible(false);
    setInterventionResult(null);
    pendingSaveRef.current = false;
    setPhase(0);
    showToast('Review your checklist before saving');
  };

  function resetAll() {
    setChecked({});
    setPair('');     setDir('BUY');          setEntry('');
    setLot('');      setSl('');              setTp('');
    setPnl('');      setPnlSign('profit');   setSession('London');
    setStrategy('Supply & Demand');          setTimeframe('H1');
    setResult(null); setSetup('');           setEmotions('');
    setMistakes(''); setLesson('');
    setPhase(0);
    showToast('Checklist reset');
  }

  const activeAccent    = phaseConfig[effectivePhase].accentColor;
  const pnlNum          = getActualPnl();
  const pnlDisplayColor = pnlNum > 0 ? colors.green : pnlNum < 0 ? colors.red : colors.muted;

  // ─────────────────────────────────────────────────────────────────────────
  // Render Checklist Content
  // ─────────────────────────────────────────────────────────────────────────

  const renderProChecklist = () => (
    <>
      <PhaseHeader
        title="CORE DISCIPLINE CHECK"
        desc="10 non-negotiable rules before every trade"
        color={colors.green}
      />
      <DisciplineLockedBadge visible={isProComplete} />
      <GroupLabel color={colors.green}>BEFORE ENTRY</GroupLabel>
      {PRO_BEFORE.map((r) => (
        <CheckItem key={r} label={r} ticked={!!checked[r]} color="g" onPress={() => toggle(r)} />
      ))}
      <GroupLabel color={colors.blue}>DURING TRADE</GroupLabel>
      {PRO_DURING.map((r) => (
        <CheckItem key={r} label={r} ticked={!!checked[r]} color="b" onPress={() => toggle(r)} />
      ))}
      <GroupLabel color={colors.red}>AFTER TRADE</GroupLabel>
      {PRO_AFTER.map((r) => (
        <CheckItem key={r} label={r} ticked={!!checked[r]} color="r" onPress={() => toggle(r)} />
      ))}
      <IdentityBlock label="IDENTITY SHIFT" quote="I don't chase money. I execute my system." />
    </>
  );

  const renderFullBefore = () => (
    <>
      <PhaseHeader title="PREPARATION PHASE" desc="Enter with clarity, not emotion" color={colors.green} />
      <GroupLabel color={colors.green}>MARKET CHECK</GroupLabel>
      {BEFORE_MARKET.map((r) => (
        <CheckItem key={r} label={r} ticked={!!checked[r]} color="g" onPress={() => toggle(r)} />
      ))}
      <GroupLabel color={colors.green}>SETUP CONFIRMATION</GroupLabel>
      {BEFORE_SETUP.map((r) => (
        <CheckItem key={r} label={r} ticked={!!checked[r]} color="g" onPress={() => toggle(r)} />
      ))}
      <GroupLabel color={colors.green}>RISK CONTROL</GroupLabel>
      {BEFORE_RISK.map((r) => (
        <CheckItem key={r} label={r} ticked={!!checked[r]} color="g" onPress={() => toggle(r)} />
      ))}
      <GroupLabel color={colors.green}>MENTAL CHECK</GroupLabel>
      {BEFORE_MENTAL.map((r) => (
        <CheckItem key={r} label={r} ticked={!!checked[r]} color="g" onPress={() => toggle(r)} />
      ))}
      <WarnBlock visible={showWarn} />
      <IdentityBlock label="IDENTITY SHIFT" quote="I don't chase money. I execute my system." />
    </>
  );

  const renderFullDuring = () => (
    <>
      <PhaseHeader title="EXECUTION PHASE" desc="Trust the plan, not your emotions" color={colors.blue} />
      <GroupLabel color={colors.blue}>I DID NOT</GroupLabel>
      {DURING_NOT.map((r) => (
        <CheckItem key={r} label={r} ticked={!!checked[r]} color="b" onPress={() => toggle(r)} />
      ))}
      <GroupLabel color={colors.blue}>I DID</GroupLabel>
      {DURING_DID.map((r) => (
        <CheckItem key={r} label={r} ticked={!!checked[r]} color="b" onPress={() => toggle(r)} />
      ))}
      <QuoteBlock text="I already made the decision. Now I let the market decide." />
    </>
  );

  const renderFullAfter = () => (
    <>
      <PhaseHeader title="REVIEW PHASE" desc="Improve process, not chase results" color={colors.red} />
      <GroupLabel color={colors.red}>TRADE REVIEW</GroupLabel>
      {AFTER_TRADE.map((r) => (
        <CheckItem key={r} label={r} ticked={!!checked[r]} color="r" onPress={() => toggle(r)} />
      ))}
      <SectionDivider label="GROWTH LOG" />
      <DarkInput label="Emotions During Trade" value={emotions} onChangeText={setEmotions} placeholder="What did you feel before, during, after?" multiline numberOfLines={3} accentColor={colors.red} />
      <DarkInput label="Mistakes Made" value={mistakes} onChangeText={setMistakes} placeholder="What went wrong? Be honest." multiline numberOfLines={3} accentColor={colors.red} />
      <DarkInput label="Lesson Learned" value={lesson} onChangeText={setLesson} placeholder="What will you do differently next time?" multiline numberOfLines={3} accentColor={colors.green} />
    </>
  );

  const renderDetails = () => {
    // Format MiniStat P&L preview dynamically
    const miniStatPnlVal = pnl
      ? isCentAccount
        ? `${pnlSign === 'loss' ? '-' : '+'}${Math.abs(parseFloat(pnl) || 0).toFixed(0)} USC`
        : `${pnlSign === 'loss' ? '-' : '+'}${currencySymbol}${Math.abs(parseFloat(pnl) || 0).toFixed(0)}`
      : '';

    return (
      <>
        <PhaseHeader title="TRADE DETAILS" desc="Record the specifics for your log" color={colors.amber} />
        {(pair || pnl) && (
          <View style={styles.previewRow}>
            <MiniStat label="Pair" value={pair.toUpperCase()} color={dir === 'BUY' ? colors.green : colors.red} />
            <View style={{ width: spacing.xs }} />
            <MiniStat label="P&L" value={miniStatPnlVal} color={pnlDisplayColor} />
            <View style={{ width: spacing.xs }} />
            <MiniStat label="TF" value={timeframe} color={colors.amber} />
          </View>
        )}

        <SectionDivider label="INSTRUMENT" />
        <DarkInput label="Trading Pair" value={pair} onChangeText={setPair} placeholder="e.g. XAUUSD" autoCapitalize="characters" accentColor={colors.amber} hint="required" />
        <DirToggle value={dir} onChange={setDir} />

        <SectionDivider label="PRICE LEVELS" />
        <View style={styles.gridRow}>
          <View style={styles.gridCol}>
            <DarkInput label="Entry Price" value={entry} onChangeText={setEntry} placeholder="0.00000" keyboardType="decimal-pad" accentColor={colors.blue} />
          </View>
          <View style={{ width: spacing.sm }} />
          <View style={styles.gridCol}>
            <DarkInput label="Lot Size" value={lot} onChangeText={setLot} placeholder="0.01" keyboardType="decimal-pad" accentColor={colors.blue} />
          </View>
        </View>
        <View style={styles.gridRow}>
          <View style={styles.gridCol}>
            <DarkInput label="Stop Loss" value={sl} onChangeText={setSl} placeholder="0.00000" keyboardType="decimal-pad" accentColor={colors.red} />
          </View>
          <View style={{ width: spacing.sm }} />
          <View style={styles.gridCol}>
            <DarkInput label="Take Profit" value={tp} onChangeText={setTp} placeholder="0.00000" keyboardType="decimal-pad" accentColor={colors.green} />
          </View>
        </View>

        <SectionDivider label="OUTCOME" />
        <View style={styles.pnlSection}>
          <Text style={styles.pnlSectionLabel}>PROFIT OR LOSS</Text>
          <View style={styles.pnlSignRow}>
            <TouchableOpacity onPress={() => setPnlSign('profit')} activeOpacity={0.7} style={[styles.pnlSignBtn, pnlSign === 'profit' && { backgroundColor: colors.green + '22', borderColor: colors.green }]}>
              <Ionicons name="add-circle" size={18} color={pnlSign === 'profit' ? colors.green : colors.muted} />
              <Text style={[styles.pnlSignText, { color: pnlSign === 'profit' ? colors.green : colors.muted }]}>PROFIT</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPnlSign('loss')} activeOpacity={0.7} style={[styles.pnlSignBtn, pnlSign === 'loss' && { backgroundColor: colors.red + '22', borderColor: colors.red }]}>
              <Ionicons name="remove-circle" size={18} color={pnlSign === 'loss' ? colors.red : colors.muted} />
              <Text style={[styles.pnlSignText, { color: pnlSign === 'loss' ? colors.red : colors.muted }]}>LOSS</Text>
            </TouchableOpacity>
          </View>
          
          {/* Dynamic Currency Label and Input */}
          <DarkInput 
            label={isCentAccount ? "Amount (USC Cents)" : `Amount (${currencySymbol})`} 
            value={pnl.replace('-', '')} 
            onChangeText={(v) => setPnl(v.replace(/[^0-9.]/g, ''))} 
            placeholder={isCentAccount ? "0" : "0.00"} 
            keyboardType="decimal-pad" 
            accentColor={pnlDisplayColor} 
          />
          
          {/* Dynamic PnL Live Preview */}
          {pnl ? (
            <View style={styles.pnlPreview}>
              <Text style={[styles.pnlPreviewText, { color: pnlDisplayColor }]}>
                {pnlSign === 'loss' ? '- ' : '+ '}
                {isCentAccount
                  ? `${Math.abs(parseFloat(pnl) || 0).toLocaleString('en-US')} USC`
                  : `${currencySymbol}${Math.abs(parseFloat(pnl) || 0).toFixed(2)}`}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.fieldLabel}>TRADE RESULT</Text>
        <View style={styles.resultRow}>
          {RESULTS.map((r) => {
            const active = result === r.key;
            return (
              <TouchableOpacity key={r.key} onPress={() => setResult(r.key)} activeOpacity={0.7} style={[styles.resultPill, active ? { backgroundColor: r.color + '22', borderColor: r.color, borderWidth: 1 } : { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 0.5 }]}>
                <Ionicons name={r.icon as any} size={16} color={active ? r.color : colors.muted} />
                <Text style={[styles.resultPillText, { color: active ? r.color : colors.muted }]}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <SectionDivider label="SESSION & STRATEGY" />
        <DarkPicker label="Session" selectedValue={session} onValueChange={setSession} items={SESSIONS} accentColor={colors.purple} />
        <DarkPicker label="Strategy" selectedValue={strategy} onValueChange={setStrategy} items={STRATEGIES} accentColor={colors.amber} />
        <DarkPicker label="Timeframe" selectedValue={timeframe} onValueChange={setTimeframe} items={TIMEFRAMES} accentColor={colors.blue} />

        <SectionDivider label="SETUP NOTES" />
        <DarkInput label="Setup Description" value={setup} onChangeText={setSetup} placeholder="Describe your setup, confluences, and reasoning..." multiline numberOfLines={4} accentColor={colors.amber} />

        {mode === 'pro' && (
          <>
            <SectionDivider label="GROWTH LOG" />
            <DarkInput label="Emotions During Trade" value={emotions} onChangeText={setEmotions} placeholder="What did you feel before, during, after?" multiline numberOfLines={3} accentColor={colors.red} />
            <DarkInput label="Mistakes Made" value={mistakes} onChangeText={setMistakes} placeholder="What went wrong? Be honest." multiline numberOfLines={3} accentColor={colors.red} />
            <DarkInput label="Lesson Learned" value={lesson} onChangeText={setLesson} placeholder="What will you do differently next time?" multiline numberOfLines={3} accentColor={colors.green} />
          </>
        )}
      </>
    );
  };

  const renderPhaseContent = () => {
    if (mode === 'pro') {
      if (effectivePhase === 0) return renderProChecklist();
      if (effectivePhase === 1) return renderDetails();
      return null;
    }
    if (effectivePhase === 0) return renderFullBefore();
    if (effectivePhase === 1) return renderFullDuring();
    if (effectivePhase === 2) return renderFullAfter();
    if (effectivePhase === 3) return renderDetails();
    return null;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>DISCIPLINE PROTOCOL</Text>
          </View>
          <Text style={styles.title}>Trade Entry Ritual</Text>
          <Text style={styles.subtitle}>
            {mode === 'pro'
              ? '10 core rules — fast & focused'
              : 'Complete each phase before saving'}
          </Text>
        </View>

        {/* ── DATE SELECTOR BAR ────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.dateSelectorBar, isBackfilled ? styles.dateSelectorBarActive : null]}
          onPress={() => { setShowDatePicker(true); Haptics.selectionAsync(); }}
          activeOpacity={0.8}
        >
          <View style={styles.dateSelectorLeft}>
            <Ionicons
              name="calendar"
              size={16}
              color={isBackfilled ? colors.amber : colors.blue}
            />
            <View>
              <Text style={styles.dateSelectorLabel}>LOGGING DATE</Text>
              <Text style={[styles.dateSelectorValue, isBackfilled && { color: colors.amber }]}>
                {isBackfilled ? formatBannerDate(selectedDateId) : `Today (${formatBannerDate(todayId())})`}
              </Text>
            </View>
          </View>
          
          <View style={styles.dateSelectorRight}>
            {isBackfilled ? (
              <TouchableOpacity
                onPress={() => { setSelectedDateId(todayId()); Haptics.selectionAsync(); }}
                style={styles.resetTodayBtn}
              >
                <Text style={styles.resetTodayText}>Reset Today</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.changeDateBtn}>
                <Text style={styles.changeDateText}>Change</Text>
                <Ionicons name="chevron-forward" size={12} color={colors.blue} />
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Mode Switcher */}
        <ModeSwitcher mode={mode} onSwitch={handleModeSwitch} />

        {/* Pre-Entry Banner */}
        {showBanner && !isBackfilled && (
          <PreEntryBanner recentTrades={recentTrades} onDismiss={() => setShowBanner(false)} />
        )}

        {/* Live Discipline Meter */}
        <LiveDisciplineMeter score={progressPct} checkedCount={totalTicked} totalRules={totalRules} />

        {/* Phase Tabs */}
        <View style={styles.tabsRow}>
          {phaseConfig.map((p, i) => {
            const active = effectivePhase === i;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => setPhase(i as Phase)}
                activeOpacity={0.7}
                style={[
                  styles.tab,
                  active && {
                    backgroundColor: p.accentColor + '18',
                    borderColor:     p.accentColor + '66',
                  },
                ]}
              >
                <View style={[styles.tabDot, { backgroundColor: active ? p.dot : colors.muted, opacity: active ? 1 : 0.4 }]} />
                <Text style={[styles.tabLabel, active && { color: p.accentColor, fontWeight: '700' }]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Phase Content */}
        <View style={styles.phaseBox}>
          {renderPhaseContent()}
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonSection}>
          <View style={styles.phaseNav}>
            {effectivePhase > 0 && (
              <TouchableOpacity
                onPress={() => setPhase((effectivePhase - 1) as Phase)}
                style={styles.phaseNavBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={14} color={colors.muted} />
                <Text style={styles.phaseNavText}>{phaseConfig[effectivePhase - 1].label}</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            {effectivePhase < maxPhase && (
              <TouchableOpacity
                onPress={() => setPhase((effectivePhase + 1) as Phase)}
                style={[styles.phaseNavBtn, { borderColor: activeAccent + '55' }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.phaseNavText, { color: activeAccent }]}>{phaseConfig[effectivePhase + 1].label}</Text>
                <Ionicons name="chevron-forward" size={14} color={activeAccent} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.dividerLine} />
          <PrimaryButton 
            label={isBackfilled ? `Save Trade for ${formatBannerDate(selectedDateId)}` : 'Save Trade Log'} 
            onPress={handleSave} 
          />
          <View style={{ height: spacing.sm }} />
          <GhostButton label="Reset Checklist" onPress={resetAll} />
        </View>
      </ScrollView>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={showDatePicker}
        currentDateId={selectedDateId}
        tradeDatesMap={tradeDatesMap}
        onSelect={(id) => {
          setSelectedDateId(id);
          setShowDatePicker(false);
        }}
        onClose={() => setShowDatePicker(false)}
      />

      {/* Intervention Modal */}
      {interventionResult && (
        <InterventionModal
          visible={interventionVisible}
          intervention={interventionResult}
          onProceed={handleInterventionProceed}
          onReview={handleInterventionReview}
        />
      )}

      <Toast message={toastMsg} visible={toastVisible} />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.bg },
  scroll:  { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 120 },

  header:    { alignItems: 'center', marginBottom: spacing.md },
  badge:     { backgroundColor: colors.green + '22', borderWidth: 1, borderColor: colors.green + '55', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, marginBottom: spacing.sm },
  badgeText: { fontFamily: font.mono, fontSize: 9, color: colors.green, letterSpacing: 1.5 },
  title:     { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: 0.3, marginBottom: 4 },
  subtitle:  { fontFamily: font.mono, fontSize: 11, color: colors.muted, textAlign: 'center' },

  // Date Selector Bar
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
  dateSelectorBarActive: {
    backgroundColor: colors.amber + '12',
    borderColor: colors.amber + '66',
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
    backgroundColor: colors.blue + '18',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  changeDateText: {
    fontFamily: font.mono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.blue,
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

  tabsRow: { flexDirection: 'row', marginBottom: spacing.lg, gap: spacing.xs },
  tab:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: radius.pill, borderWidth: 0.5, borderColor: colors.border, gap: 5, backgroundColor: colors.surface2 },
  tabDot:  { width: 5, height: 5, borderRadius: 3 },
  tabLabel: { fontFamily: font.mono, fontSize: 10, color: colors.muted },

  phaseBox: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },

  previewRow: { flexDirection: 'row', marginBottom: spacing.sm },
  gridRow:    { flexDirection: 'row' },
  gridCol:    { flex: 1 },

  fieldLabel: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, marginTop: spacing.xs },

  pnlSection:      { marginBottom: spacing.sm },
  pnlSectionLabel: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: 8 },
  pnlSignRow:      { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  pnlSignBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.sm, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface2 },
  pnlSignText:     { fontFamily: font.mono, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  pnlPreview:      { backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
  pnlPreviewText:  { fontFamily: font.mono, fontSize: 20, fontWeight: '800', letterSpacing: 1 },

  resultRow:      { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  resultPill:     { flex: 1, paddingVertical: 12, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', gap: 4 },
  resultPillText: { fontFamily: font.mono, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  buttonSection: { gap: 0 },
  phaseNav:      { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  phaseNavBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface2 },
  phaseNavText:  { fontFamily: font.mono, fontSize: 11, color: colors.muted },
  dividerLine:   { height: 0.5, backgroundColor: colors.border, marginBottom: spacing.md },
});