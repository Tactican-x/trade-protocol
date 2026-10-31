import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadGoals, saveGoals, Goals } from '../store/journal';
import { loadTrades, calcStats } from '../store/trades';
import { colors, font, spacing, radius } from '../theme';
import { Toast } from '../components/UI';
import { useAppContext } from '../context/AppContext';

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

// ── Goal Card ─────────────────────────────────────────────────────────────────
function GoalCard({
  icon, label, target, current, unit, color, suffix,
  onChangeTarget, achieved, isMonetary,
}: {
  icon: string; label: string; target: string; current: number;
  unit: string; color: string; suffix?: string;
  onChangeTarget: (v: string) => void; achieved: boolean;
  isMonetary?: boolean;
}) {
  const targetNum = parseFloat(target) || 0;
  const progress = targetNum > 0 ? Math.min(100, Math.round((current / targetNum) * 100)) : 0;
  const [focused, setFocused] = useState(false);

  // Dynamic values formatter supporting both standard and cent account modes
  const formatDisplayValue = (val: number) => {
    if (isMonetary) {
      if (suffix) {
        return `${suffix} ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return `${Math.round(val).toLocaleString('en-US')}${unit}`;
    }
    return `${val.toFixed(0)}${unit}`;
  };

  const formatDisplayTarget = (valStr: string) => {
    const valNum = parseFloat(valStr) || 0;
    if (isMonetary) {
      if (suffix) {
        return `${suffix} ${valNum.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
      }
      return `${Math.round(valNum).toLocaleString('en-US')}${unit}`;
    }
    return `${valNum}${unit}`;
  };

  return (
    <View style={[gcStyles.card, achieved && { borderColor: color + '66' }]}>
      <View style={gcStyles.header}>
        <View style={[gcStyles.iconBg, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon as any} size={18} color={color} />
        </View>
        <View style={gcStyles.titleCol}>
          <Text style={gcStyles.label}>{label}</Text>
          <Text style={[gcStyles.status, { color: achieved ? colors.green : colors.muted }]}>
            {achieved ? '✓ GOAL ACHIEVED!' : `${formatDisplayValue(current)} of ${formatDisplayTarget(target)}`}
          </Text>
        </View>
        {achieved && (
          <Ionicons name="trophy" size={18} color={colors.amber} />
        )}
      </View>

      {/* Progress bar */}
      <View style={gcStyles.barBg}>
        <View style={[gcStyles.barFill, { width: `${progress}%`, backgroundColor: color }]} />
      </View>
      <Text style={gcStyles.pct}>{progress}% of target</Text>

      {/* Target input */}
      <View style={[gcStyles.inputContainer, focused && { borderColor: color + '88' }]}>
        <Text style={gcStyles.inputLabel}>TARGET</Text>
        <View style={gcStyles.inputRow}>
          {suffix && <Text style={[gcStyles.suffix, { color }]}>{suffix}</Text>}
          <TextInput
            value={target}
            onChangeText={onChangeTarget}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={gcStyles.input}
          />
          {unit ? <Text style={[gcStyles.unit, { color }]}>{unit}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const gcStyles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  iconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  titleCol: { flex: 1 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  status: { fontFamily: font.mono, fontSize: 10 },
  barBg: { height: 8, backgroundColor: colors.surface2, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  barFill: { height: 8, borderRadius: 4 },
  pct: { fontFamily: font.mono, fontSize: 9, color: colors.muted, marginBottom: spacing.sm },
  inputContainer: { backgroundColor: colors.surface2, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm },
  inputLabel: { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1.5, marginBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  suffix: { fontFamily: font.mono, fontSize: 16, fontWeight: '700' },
  input: { flex: 1, color: colors.text, fontSize: 20, fontFamily: font.mono, fontWeight: '800' },
  unit: { fontFamily: font.mono, fontSize: 12 },
});

// ══════════════════════════════════════════════════════════════════════════════
export default function GoalsScreen() {
  const { accent } = useAppContext();
  const [goals, setGoals] = useState<Goals>({
    monthlyPnl: 1000,
    winRate: 60,
    discipline: 80,
    tradesPerMonth: 20,
  });
  const [stats, setStats] = useState<ReturnType<typeof calcStats> | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // Currency & Cent Account States
  const [currencyCode, setCurrencyCode]   = useState('USD');
  const [isCentAccount, setIsCentAccount] = useState(false);

  useEffect(() => {
    loadGoals().then(setGoals);
    loadTrades().then((trades) => setStats(calcStats(trades)));
    
    // Fetch user preferences
    AsyncStorage.getItem('@currency').then((c) => {
      if (c) setCurrencyCode(c);
    });
    AsyncStorage.getItem('@is_cent_account').then((isCent) => {
      setIsCentAccount(isCent === 'true');
    });
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(false);
    setTimeout(() => setToastVisible(true), 50);
  };

  const handleSave = async () => {
    await saveGoals(goals);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('Goals saved successfully');
  };

  const currencySymbol = useMemo(() => {
    return CURRENCY_SYMBOLS[currencyCode] || '$';
  }, [currencyCode]);

  const monthPnl = stats?.thisMonthPnl ?? 0;
  const winRate  = stats?.winRate ?? 0;
  const disc     = stats?.avgDiscipline ?? 0;
  const monthT   = stats?.thisMonthTrades ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Goals & Targets' }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.headerCard}>
          <Text style={styles.headerEmoji}>🎯</Text>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Goals & Targets</Text>
            <Text style={styles.headerSub}>
              Set your monthly targets and track progress
            </Text>
          </View>
        </View>

        {/* Cent Account Warnings */}
        {isCentAccount && (
          <View style={styles.centTrackerBanner}>
            <Ionicons name="sparkles" size={13} color={colors.amber} />
            <Text style={styles.centTrackerBannerText}>
              CENT ACCOUNT GOAL MODE ACTIVE (UNIT: USC)
            </Text>
          </View>
        )}

        {/* ── Goal Cards ───────────────────────────────────────────────── */}
        <GoalCard
          icon="cash"
          label="Monthly P&L Target"
          target={String(goals.monthlyPnl)}
          current={monthPnl}
          unit={isCentAccount ? " USC" : ""}
          suffix={isCentAccount ? undefined : currencySymbol}
          color={colors.green}
          achieved={monthPnl >= goals.monthlyPnl}
          isMonetary
          onChangeTarget={(v) => setGoals((g) => ({ ...g, monthlyPnl: parseFloat(v) || 0 }))}
        />

        <GoalCard
          icon="analytics"
          label="Win Rate Target"
          target={String(goals.winRate)}
          current={winRate}
          unit="%"
          color={colors.blue}
          achieved={winRate >= goals.winRate}
          onChangeTarget={(v) => setGoals((g) => ({ ...g, winRate: parseFloat(v) || 0 }))}
        />

        <GoalCard
          icon="shield-checkmark"
          label="Discipline Score Target"
          target={String(goals.discipline)}
          current={disc}
          unit="%"
          color={colors.purple}
          achieved={disc >= goals.discipline}
          onChangeTarget={(v) => setGoals((g) => ({ ...g, discipline: parseFloat(v) || 0 }))}
        />

        <GoalCard
          icon="layers"
          label="Trades Per Month"
          target={String(goals.tradesPerMonth)}
          current={monthT}
          unit=" trades"
          color={colors.amber}
          achieved={monthT >= goals.tradesPerMonth}
          onChangeTarget={(v) => setGoals((g) => ({ ...g, tradesPerMonth: parseFloat(v) || 0 }))}
        />

        {/* ── Save Button ───────────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveBtn, { backgroundColor: accent }]}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark" size={20} color={colors.bg} />
          <Text style={styles.saveBtnText}>Save Goals</Text>
        </TouchableOpacity>

        {/* ── Tip ──────────────────────────────────────────────────────── */}
        <View style={styles.tipCard}>
          <Ionicons name="bulb" size={14} color={colors.amber} />
          <Text style={styles.tipText}>
            Tip: Set realistic goals. Professional traders target 5-10% monthly returns. Focus on discipline first — profit follows.
          </Text>
        </View>
      </ScrollView>

      <Toast message={toastMsg} visible={toastVisible} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 60 },

  headerCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  headerEmoji: { fontSize: 36 },
  headerText: { flex: 1 },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 4 },
  headerSub: { fontFamily: font.mono, fontSize: 10, color: colors.muted, lineHeight: 16 },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.md, paddingVertical: 14, marginBottom: spacing.md },
  saveBtnText: { fontFamily: font.mono, fontSize: 14, fontWeight: '700', color: colors.bg },

  tipCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.amber + '11', borderWidth: 0.5, borderColor: colors.amber + '44', borderRadius: radius.sm, padding: spacing.md },
  tipText: { flex: 1, fontFamily: font.mono, fontSize: 11, color: colors.muted, lineHeight: 17 },

  centTrackerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.amber + '11',
    borderWidth: 0.5,
    borderColor: colors.amber + '33',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  centTrackerBannerText: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.amber,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});