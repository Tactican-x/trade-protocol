import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Keyboard,
  ActivityIndicator,
  Modal,
  BackHandler,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  MentalLog,
  getMentalLogForDate,
  saveMentalLog,
  deleteMentalLog,
  loadTrades,
  Trade,
  loadMentalLogs,     
} from '../store/trades';
import { colors } from '../theme';
import { Toast } from '../components/UI';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

type Mood = 'focused' | 'neutral' | 'anxious' | 'frustrated' | 'tired' | 'confident';
type Bias = 'bullish' | 'bearish' | 'neutral';

const MOODS: { key: Mood; emoji: string; label: string; color: string }[] = [
  { key: 'focused',    emoji: '🎯', label: 'Focused',    color: colors.green  },
  { key: 'confident',  emoji: '💪', label: 'Confident',  color: colors.blue   },
  { key: 'neutral',    emoji: '😐', label: 'Neutral',    color: colors.amber  },
  { key: 'anxious',    emoji: '😰', label: 'Anxious',    color: colors.red    },
  { key: 'frustrated', emoji: '😤', label: 'Frustrated', color: colors.red    },
  { key: 'tired',      emoji: '😴', label: 'Tired',      color: colors.purple },
];

const BIASES: { key: Bias; icon: string; label: string; color: string }[] = [
  { key: 'bullish', icon: 'trending-up',   label: 'Bullish', color: colors.green },
  { key: 'bearish', icon: 'trending-down', label: 'Bearish', color: colors.red   },
  { key: 'neutral', icon: 'remove',        label: 'Neutral', color: colors.amber },
];

const INTENTION_PROMPTS = [
  'I will only take A+ setups today',
  'I will follow my plan without hesitation',
  'I will wait for confirmation before entering',
  'I will honor my stop losses',
  'I will not revenge trade',
];

const REFLECTION_PROMPTS = [
  'What went well today?',
  'One rule I followed / broke...',
  'What surprised me about the market?',
  'How was my emotional state?',
  'What would I do differently?',
];

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function toDateId(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayId(): string {
  return toDateId(new Date());
}

function getDateId(dateParam?: string): string {
  if (!dateParam || dateParam === 'today') return todayId();
  return dateParam;
}

function parseDateId(id: string): Date {
  const [y, m, d] = id.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getDateStr(dateId: string): string {
  const d = parseDateId(dateId);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day:     '2-digit',
    month:   'long',
    year:    'numeric',
  });
}

function isToday(dateId: string): boolean {
  return dateId === todayId();
}

function isFuture(dateId: string): boolean {
  return dateId > todayId();
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

function LevelSlider({ label, value, color, icon, onChange }: any) {
  const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const getLevelLabel = (val: number) => {
    if (val <= 2) return 'Very Low';
    if (val <= 4) return 'Low';
    if (val <= 6) return 'Medium';
    if (val <= 8) return 'High';
    return 'Excellent';
  };

  return (
    <View style={sliderStyles.container}>
      <View style={sliderStyles.header}>
        <Text style={sliderStyles.icon}>{icon}</Text>
        <Text style={sliderStyles.label}>{label}</Text>
        <Text style={[sliderStyles.valueText, { color }]}>{value}/10</Text>
      </View>
      <View style={sliderStyles.barContainer}>
        {levels.map((level) => {
          const isActive = level <= value;
          const isExact  = level === value;
          return (
            <TouchableOpacity
              key={level}
              style={[
                sliderStyles.barSegment,
                { backgroundColor: isActive ? color : colors.border },
                isExact && { transform: [{ scaleY: 1.4 }] },
              ]}
              onPress={() => { onChange(level); Haptics.selectionAsync(); }}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 2, right: 2 }}
            />
          );
        })}
      </View>
      <View style={sliderStyles.footerRow}>
        <Text style={sliderStyles.hint}>Tap any segment</Text>
        <Text style={[sliderStyles.levelLabel, { color }]}>{getLevelLabel(value)}</Text>
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container:    { marginBottom: 16 },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  icon:         { fontSize: 14 },
  label:        { flex: 1, fontSize: 12, fontWeight: '700', color: colors.text },
  valueText:    { fontSize: 14, fontWeight: '800', fontFamily: 'monospace' },
  barContainer: { flexDirection: 'row', gap: 3, height: 24, alignItems: 'center' },
  barSegment:   { flex: 1, height: 16, borderRadius: 4 },
  footerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  hint:         { fontSize: 9, color: colors.muted, fontFamily: 'monospace', fontStyle: 'italic' },
  levelLabel:   { fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },
});

function PromptChips({ prompts, onSelect }: { prompts: string[]; onSelect: (t: string) => void; }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 6 }} keyboardShouldPersistTaps="handled">
      {prompts.map((p, i) => (
        <TouchableOpacity key={i} style={promptStyles.chip} onPress={() => { onSelect(p); Haptics.selectionAsync(); }} activeOpacity={0.7}>
          <Ionicons name="sparkles" size={10} color={colors.muted} />
          <Text style={promptStyles.chipText}>{p}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
const promptStyles = StyleSheet.create({
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 10, color: colors.text, fontFamily: 'monospace' },
});

function ScrollableInput({ label, hint, value, onChangeText, placeholder, maxLength, scrollRef, prompts }: any) {
  const inputRef = useRef<View>(null);
  const handleFocus = () => {
    setTimeout(() => {
      inputRef.current?.measureLayout(scrollRef.current as any, (_x, y) => scrollRef.current?.scrollTo({ y: y - 80, animated: true }), () => {});
    }, 250);
  };
  const countColor = maxLength - value.length < 20 ? colors.red : maxLength - value.length < 60 ? colors.amber : colors.muted;

  return (
    <View ref={inputRef} style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.sectionHint}>{hint}</Text>
      {prompts && value.length === 0 && <PromptChips prompts={prompts} onSelect={onChangeText} />}
      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline
        textAlignVertical="top"
        maxLength={maxLength}
        onFocus={handleFocus}
      />
      <Text style={[styles.charCount, { color: countColor }]}>{value.length}/{maxLength}</Text>
    </View>
  );
}

function DatePickerModal({ visible, currentDateId, loggedDates, onSelect, onClose }: any) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseDateId(currentDateId);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    if (visible) {
      const d = parseDateId(currentDateId);
      setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [visible, currentDateId]);

  const monthName = viewMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDay    = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const today       = todayId();
  const cells: (number | null)[] = Array.from({ length: firstDay }, () => null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
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
            <TouchableOpacity onPress={goPrevMonth} style={pickerStyles.navBtn}><Ionicons name="chevron-back" size={18} color={colors.text} /></TouchableOpacity>
            <Text style={pickerStyles.monthText}>{monthName}</Text>
            <TouchableOpacity onPress={goNextMonth} style={[pickerStyles.navBtn, !canGoNext && { opacity: 0.3 }]} disabled={!canGoNext}><Ionicons name="chevron-forward" size={18} color={colors.text} /></TouchableOpacity>
          </View>
          <View style={pickerStyles.weekHeader}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={pickerStyles.weekDay}>{d}</Text>)}
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
                  style={[pickerStyles.cell, isSelected && { backgroundColor: colors.green + '33', borderColor: colors.green }, isTodayCell && !isSelected && { borderColor: colors.blue + '99' }, isFutureCell && { opacity: 0.3 }]}
                  onPress={() => { if (!isFutureCell) { onSelect(dateId); Haptics.selectionAsync(); } }}
                  disabled={isFutureCell} activeOpacity={0.7}
                >
                  <Text style={[pickerStyles.dayNum, isSelected && { color: colors.green, fontWeight: '800' }, isTodayCell && !isSelected && { color: colors.blue }]}>{day}</Text>
                  {hasLog && <View style={[pickerStyles.dot, { backgroundColor: isSelected ? colors.green : colors.text }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
const pickerStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  sheet:      { backgroundColor: colors.bg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn:     { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  monthText:  { fontSize: 14, fontWeight: '800', color: colors.text },
  weekHeader: { flexDirection: 'row', marginBottom: 6 },
  weekDay:    { flex: 1, textAlign: 'center', fontSize: 10, color: colors.muted, fontFamily: 'monospace', fontWeight: '700' },
  grid:       { flexDirection: 'row', flexWrap: 'wrap' },
  cell:       { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 8 },
  dayNum:     { fontSize: 12, color: colors.text, fontFamily: 'monospace' },
  dot:        { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  legend:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 10, color: colors.muted, fontFamily: 'monospace' },
});

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════

export default function MentalLogScreen() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const [currentDateId, setCurrentDateId] = useState(() => getDateId(date));

  useEffect(() => {
    if (date) setCurrentDateId(getDateId(date));
  }, [date]);

  const currentDateStr = getDateStr(currentDateId);
  const currentIsToday = isToday(currentDateId);

  const [mood, setMood]             = useState<Mood>('neutral');
  const [bias, setBias]             = useState<Bias>('neutral');
  const [focusLevel, setFocus]      = useState(5);
  const [patience, setPatience]     = useState(5);
  const [confidence, setConfidence] = useState(5);
  const [intention, setIntention]   = useState('');
  const [reflection, setReflection] = useState('');
  const [saving, setSaving]         = useState(false);
  const [existingLog, setExisting]  = useState<MentalLog | null>(null);
  const [isDirty, setIsDirty]       = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [trades, setTrades]         = useState<Trade[]>([]);
  const [allLogs, setAllLogs]       = useState<MentalLog[]>([]);
  const [toast, setToast]           = useState({ msg: '', visible: false });
  const [loading, setLoading]       = useState(true);

  const showToast = (msg: string) => {
    setToast({ msg, visible: false });
    setTimeout(() => setToast({ msg, visible: true }), 50);
  };

  useFocusEffect(
    useCallback(() => {
      loadMentalLogs().then((logs) => {
        // Enforce descending sort on load
        setAllLogs([...logs].sort((a, b) => b.date.localeCompare(a.date)));
      });
      loadTrades().then(setTrades);
    }, [])
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const log = await getMentalLogForDate(currentDateId);
      if (cancelled) return;
      if (log) {
        setExisting(log);
        setMood(log.mood);
        setBias(log.bias);
        setFocus(log.focusLevel);
        setPatience(log.patience);
        setConfidence(log.confidence);
        setIntention(log.intention);
        setReflection(log.reflection);
      } else {
        setExisting(null);
        setMood('neutral');
        setBias('neutral');
        setFocus(5);
        setPatience(5);
        setConfidence(5);
        setIntention('');
        setReflection('');
      }
      setIsDirty(false);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentDateId]);

  const tradesOnDate = useMemo(() => {
    return trades.filter((t) => toDateId(new Date(t.timestamp)) === currentDateId);
  }, [trades, currentDateId]);

  const loggedDates = useMemo(() => new Set(allLogs.map((l) => l.date)), [allLogs]);

  const streak = useMemo(() => {
    if (allLogs.length === 0) return 0;
    const sorted = [...allLogs].map((l) => l.date).sort((a, b) => b.localeCompare(a));
    let count = 0;
    let cursor = todayId();
    for (const d of sorted) {
      if (d === cursor) {
        count++;
        const prev = parseDateId(cursor);
        prev.setDate(prev.getDate() - 1);
        cursor = toDateId(prev);
      } else if (d < cursor) {
        break;
      }
    }
    return count;
  }, [allLogs]);

  const tryChangeDate = (newId: string) => {
    if (isFuture(newId)) return;
    if (isDirty) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Discard them?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => { setCurrentDateId(newId); Haptics.selectionAsync(); } },
        ]
      );
    } else {
      setCurrentDateId(newId);
      Haptics.selectionAsync();
    }
  };

  const goToPreviousDay = () => { const d = parseDateId(currentDateId); d.setDate(d.getDate() - 1); tryChangeDate(toDateId(d)); };
  const goToNextDay = () => { const d = parseDateId(currentDateId); d.setDate(d.getDate() + 1); const newId = toDateId(d); if (newId <= todayId()) tryChangeDate(newId); };
  const canGoForward = !currentIsToday && !isFuture(currentDateId);
  const markDirty = () => { if (!loading) setIsDirty(true); };

  useEffect(() => {
    const onBack = () => {
      if (isDirty) {
        Alert.alert('Unsaved Changes', 'Save before leaving?', [
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: handleSave },
        ]);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [isDirty, mood, bias, focusLevel, patience, confidence, intention, reflection]);

  const handleSave = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // ✅ FIX: Calculate timestamp representing the exact selected date (not "right now")
      const logDate = parseDateId(currentDateId);
      const now = new Date();
      logDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
      if (logDate.getTime() > Date.now()) logDate.setTime(Date.now()); // Clamp to now if accidentally future

      const log: MentalLog = {
        id:         currentDateId,
        date:       currentDateId,
        dateStr:    currentDateStr,
        mood, bias, focusLevel, patience, confidence,
        intention:  intention.trim(),
        reflection: reflection.trim(),
        timestamp:  logDate.toISOString(), // ✅ Proper historical timestamp
      };

      await saveMentalLog(log);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsDirty(false);
      setExisting(log);
      setAllLogs((prev) => {
        const filtered = prev.filter((l) => l.date !== log.date);
        return [...filtered, log].sort((a, b) => b.date.localeCompare(a.date));
      });
      Keyboard.dismiss();
      showToast('✓ Mental log saved');
      setTimeout(() => router.back(), 600);
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast('Failed to save log');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existingLog) return;
    Alert.alert('Delete Mental Log', `Delete your log for ${currentDateStr}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMentalLog(currentDateId);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setAllLogs((prev) => prev.filter((l) => l.date !== currentDateId));
          showToast('Log deleted');
          setTimeout(() => router.back(), 400);
        },
      },
    ]);
  };

  const avgScore = Math.round((focusLevel + patience + confidence) / 3);
  const avgColor = avgScore >= 7 ? colors.green : avgScore >= 5 ? colors.amber : colors.red;
  const dayPnl = useMemo(() => tradesOnDate.reduce((s, t) => s + (t.pnl || 0), 0), [tradesOnDate]);
  const dayWins = tradesOnDate.filter((t) => t.result === 'win').length;
  const dayLosses = tradesOnDate.filter((t) => t.result === 'loss').length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <ScrollView ref={scrollRef} style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          
          {streak > 0 && (
            <View style={styles.streakBanner}>
              <Ionicons name="flame" size={14} color={colors.amber} />
              <Text style={styles.streakText}>{streak}-day journaling streak — keep it going</Text>
            </View>
          )}

          <View style={styles.dateNav}>
            <TouchableOpacity style={styles.dateNavBtn} onPress={goToPreviousDay} activeOpacity={0.7}><Ionicons name="chevron-back" size={20} color={colors.text} /></TouchableOpacity>
            <TouchableOpacity style={styles.dateCenter} onPress={() => { setShowPicker(true); Haptics.selectionAsync(); }} activeOpacity={0.7}>
              <Text style={styles.dateText}>{currentDateStr}</Text>
              <View style={styles.dateBadgeRow}>
                {currentIsToday && <View style={styles.todayBadge}><Text style={styles.todayBadgeText}>TODAY</Text></View>}
                {existingLog && <View style={styles.editBadge}><Ionicons name="checkmark-circle" size={10} color={colors.green} /><Text style={styles.editBadgeText}>LOGGED</Text></View>}
                {isDirty && <View style={styles.dirtyBadge}><View style={styles.dirtyDot} /><Text style={styles.dirtyText}>UNSAVED</Text></View>}
              </View>
              <Text style={styles.tapHint}>Tap for calendar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.dateNavBtn, !canGoForward && { opacity: 0.3 }]} onPress={goToNextDay} disabled={!canGoForward} activeOpacity={0.7}><Ionicons name="chevron-forward" size={20} color={colors.text} /></TouchableOpacity>
          </View>

          {tradesOnDate.length > 0 && (
            <TouchableOpacity style={styles.tradesCorrelation} onPress={() => router.push('/(tabs)/history')} activeOpacity={0.7}>
              <View style={styles.tradesCorrelationLeft}><Ionicons name="stats-chart" size={14} color={colors.blue} /><Text style={styles.tradesCorrelationText}>{tradesOnDate.length} trade{tradesOnDate.length > 1 ? 's' : ''} · {dayWins}W {dayLosses}L</Text></View>
              <View style={styles.tradesCorrelationRight}><Text style={[styles.tradesCorrelationPnl, { color: dayPnl >= 0 ? colors.green : colors.red }]}>{dayPnl >= 0 ? '+' : ''}${dayPnl.toFixed(0)}</Text><Ionicons name="chevron-forward" size={12} color={colors.muted} /></View>
            </TouchableOpacity>
          )}

          <View style={styles.scoreOverview}>
            <View style={[styles.scoreCircle, { borderColor: avgColor }]}><Text style={[styles.scoreValue, { color: avgColor }]}>{avgScore}</Text><Text style={styles.scoreLabel}>AVG</Text></View>
            <View style={styles.scoreBreakdown}>
              <View style={styles.scoreBreakdownItem}><Text style={styles.scoreBreakdownLabel}>Focus</Text><Text style={[styles.scoreBreakdownValue, { color: colors.green }]}>{focusLevel}</Text></View>
              <View style={styles.scoreBreakdownDivider} />
              <View style={styles.scoreBreakdownItem}><Text style={styles.scoreBreakdownLabel}>Patience</Text><Text style={[styles.scoreBreakdownValue, { color: colors.blue }]}>{patience}</Text></View>
              <View style={styles.scoreBreakdownDivider} />
              <View style={styles.scoreBreakdownItem}><Text style={styles.scoreBreakdownLabel}>Confidence</Text><Text style={[styles.scoreBreakdownValue, { color: colors.amber }]}>{confidence}</Text></View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>HOW ARE YOU FEELING?</Text>
            <View style={styles.moodGrid}>
              {MOODS.map((m) => {
                const isActive = mood === m.key;
                return (
                  <TouchableOpacity key={m.key} style={[styles.moodChip, isActive && { backgroundColor: m.color + '22', borderColor: m.color }]} onPress={() => { setMood(m.key); markDirty(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} activeOpacity={0.7}>
                    <Text style={styles.moodEmoji}>{m.emoji}</Text>
                    <Text style={[styles.moodLabel, isActive && { color: m.color, fontWeight: '700' }]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>MARKET BIAS TODAY</Text>
            <View style={styles.biasRow}>
              {BIASES.map((b) => {
                const isActive = bias === b.key;
                return (
                  <TouchableOpacity key={b.key} style={[styles.biasChip, isActive && { backgroundColor: b.color + '22', borderColor: b.color }]} onPress={() => { setBias(b.key); markDirty(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} activeOpacity={0.7}>
                    <Ionicons name={b.icon as any} size={18} color={isActive ? b.color : colors.muted} />
                    <Text style={[styles.biasLabel, isActive && { color: b.color, fontWeight: '700' }]}>{b.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>MENTAL LEVELS</Text>
            <LevelSlider label="Focus Level" value={focusLevel} color={colors.green} icon="🎯" onChange={(v) => { setFocus(v); markDirty(); }} />
            <LevelSlider label="Patience"    value={patience}   color={colors.blue}  icon="⏳" onChange={(v) => { setPatience(v); markDirty(); }} />
            <LevelSlider label="Confidence"  value={confidence} color={colors.amber} icon="💪" onChange={(v) => { setConfidence(v); markDirty(); }} />
          </View>

          <ScrollableInput label="☀️ MORNING INTENTION" hint="What is your goal for today? What will you focus on?" value={intention} onChangeText={(v) => { setIntention(v); markDirty(); }} placeholder="e.g. I will only take A+ setups and follow my plan..." maxLength={300} scrollRef={scrollRef} prompts={INTENTION_PROMPTS} />
          <ScrollableInput label="🌙 END OF DAY REFLECTION" hint="How did the session go? Did you stick to your plan?" value={reflection} onChangeText={(v) => { setReflection(v); markDirty(); }} placeholder="e.g. I followed my rules today, but I need to work on patience..." maxLength={500} scrollRef={scrollRef} prompts={REFLECTION_PROMPTS} />

          <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
            {saving ? <ActivityIndicator color={colors.bg} size="small" /> : <Ionicons name={existingLog ? 'checkmark-circle' : 'cloud-upload'} size={20} color={colors.bg} />}
            <Text style={styles.saveButtonText}>{saving ? 'Saving...' : existingLog ? 'Update Log' : 'Save Log'}</Text>
          </TouchableOpacity>

          {existingLog && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={16} color={colors.red} />
              <Text style={styles.deleteButtonText}>Delete This Log</Text>
            </TouchableOpacity>
          )}

          <View style={styles.keyboardSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>

      <DatePickerModal visible={showPicker} currentDateId={currentDateId} loggedDates={loggedDates} onSelect={(id) => { setShowPicker(false); tryChangeDate(id); }} onClose={() => setShowPicker(false)} />
      <Toast message={toast.msg} visible={toast.visible} />
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.bg },
  scrollView:    { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  streakBanner:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.amber + '15', borderWidth: 0.5, borderColor: colors.amber + '44', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  streakText:    { fontSize: 11, color: colors.amber, fontWeight: '700', fontFamily: 'monospace' },

  dateNav:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  dateNavBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  dateCenter:    { flex: 1, alignItems: 'center', gap: 4, marginHorizontal: 8 },
  dateText:      { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'center' },
  dateBadgeRow:  { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  tapHint:       { fontSize: 9, color: colors.muted, fontFamily: 'monospace', fontStyle: 'italic', marginTop: 2 },
  todayBadge:    { backgroundColor: colors.green + '22', borderWidth: 1, borderColor: colors.green + '55', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  todayBadgeText:{ fontSize: 8, fontWeight: '700', color: colors.green, fontFamily: 'monospace', letterSpacing: 1 },
  editBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.green + '12', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  editBadgeText: { fontSize: 8, fontWeight: '700', color: colors.green, fontFamily: 'monospace', letterSpacing: 0.5 },
  dirtyBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.amber + '22', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  dirtyDot:      { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.amber },
  dirtyText:     { fontSize: 8, fontWeight: '700', color: colors.amber, fontFamily: 'monospace', letterSpacing: 0.5 },

  tradesCorrelation:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 12 },
  tradesCorrelationLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tradesCorrelationText:  { fontSize: 11, color: colors.text, fontFamily: 'monospace', fontWeight: '600' },
  tradesCorrelationRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tradesCorrelationPnl:   { fontSize: 12, fontFamily: 'monospace', fontWeight: '800' },

  scoreOverview:          { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, marginBottom: 16, gap: 16 },
  scoreCircle:            { width: 64, height: 64, borderRadius: 32, borderWidth: 3, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  scoreValue:             { fontSize: 22, fontWeight: '800', fontFamily: 'monospace' },
  scoreLabel:             { fontSize: 8, fontWeight: '700', color: colors.muted, fontFamily: 'monospace', letterSpacing: 1 },
  scoreBreakdown:         { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  scoreBreakdownItem:     { alignItems: 'center', gap: 2 },
  scoreBreakdownLabel:    { fontSize: 9, color: colors.muted, fontFamily: 'monospace' },
  scoreBreakdownValue:    { fontSize: 18, fontWeight: '800', fontFamily: 'monospace' },
  scoreBreakdownDivider:  { width: 1, backgroundColor: colors.border, alignSelf: 'stretch' },

  section:      { marginBottom: 20 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, fontFamily: 'monospace', letterSpacing: 1.5, marginBottom: 8 },
  sectionHint:  { fontSize: 11, color: colors.muted, marginBottom: 8, lineHeight: 16 },

  moodGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moodChip:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, minWidth: '30%' },
  moodEmoji: { fontSize: 18 },
  moodLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },

  biasRow:   { flexDirection: 'row', gap: 8 },
  biasChip:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  biasLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },

  input:          { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 14, color: colors.text },
  multilineInput: { minHeight: 100, maxHeight: 200 },
  charCount:      { fontSize: 10, fontFamily: 'monospace', textAlign: 'right', marginTop: 4 },

  saveButton:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.green, borderRadius: 14, padding: 16, marginTop: 8 },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText:     { fontSize: 15, fontWeight: '800', color: colors.bg, letterSpacing: 0.5 },

  deleteButton:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 12 },
  deleteButtonText: { fontSize: 13, fontWeight: '600', color: colors.red },

  keyboardSpacer: { height: 200 },
});