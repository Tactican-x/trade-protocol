import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, font, spacing, radius } from '../theme';
import { useAppContext, ACCENT_COLORS } from '../context/AppContext';
import { loadTrades, exportTrades, calcStats } from '../store/trades';
import { loadGoals, Goals, AccentColor } from '../store/journal';
import { Toast } from '../components/UI';

// ── Menu Item ─────────────────────────────────────────────────────────────────
function MenuItem({
  icon, label, desc, color, onPress, badge,
}: {
  icon: string; label: string; desc: string;
  color: string; onPress: () => void; badge?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={menuStyles.item}
    >
      <View style={[menuStyles.iconBg, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <View style={menuStyles.textCol}>
        <Text style={menuStyles.label}>{label}</Text>
        <Text style={menuStyles.desc}>{desc}</Text>
      </View>
      {badge && (
        <View style={[menuStyles.badge, { backgroundColor: color + '22', borderColor: color + '55' }]}>
          <Text style={[menuStyles.badgeText, { color }]}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}
const menuStyles = StyleSheet.create({
  item:      { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.md },
  iconBg:    { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  textCol:   { flex: 1 },
  label:     { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  desc:      { fontFamily: font.mono, fontSize: 10, color: colors.muted },
  badge:     { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontFamily: font.mono, fontSize: 9, fontWeight: '700' },
});

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return <Text style={secStyles.label}>{label}</Text>;
}
const secStyles = StyleSheet.create({
  label: {
    fontFamily:    font.mono,
    fontSize:      9,
    color:         colors.muted,
    letterSpacing: 1.5,
    marginBottom:  spacing.sm,
    marginTop:     spacing.md,
  },
});

// ── Goals Progress Card ───────────────────────────────────────────────────────
function GoalsProgressCard({
  goals, monthPnl, monthTrades, lastMonthPnl, lastMonthTrades, accent, onPress,
}: {
  goals:           Goals;
  monthPnl:        number;
  monthTrades:     number;
  lastMonthPnl:    number;
  lastMonthTrades: number;
  accent:          string;
  onPress:         () => void;
}) {
  const target       = goals.monthlyPnl;
  const hasTarget    = target > 0;
  const goalProgress = hasTarget
    ? Math.min(100, Math.max(0, Math.round((monthPnl / target) * 100)))
    : 0;
  const achieved      = monthPnl >= target && hasTarget;
  const barColor      = achieved ? colors.green : accent;
  const pnlColor      = monthPnl     > 0 ? colors.green : monthPnl     < 0 ? colors.red : colors.muted;
  const lastPnlColor  = lastMonthPnl > 0 ? colors.green : lastMonthPnl < 0 ? colors.red : colors.muted;

  const now           = new Date();
  const monthName     = now.toLocaleDateString('en-GB', { month: 'long' });
  const lastMonthName = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toLocaleDateString('en-GB', { month: 'long' });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={gpStyles.card}>
      <View style={gpStyles.header}>
        <View style={[gpStyles.iconBg, { backgroundColor: barColor + '18' }]}>
          <Ionicons name="flag" size={14} color={barColor} />
        </View>
        <Text style={gpStyles.title}>MONTHLY GOAL — {monthName.toUpperCase()}</Text>
        {achieved && (
          <View style={gpStyles.achievedBadge}>
            <Ionicons name="trophy" size={10} color={colors.green} />
            <Text style={gpStyles.achievedText}>ACHIEVED</Text>
          </View>
        )}
      </View>

      <View style={gpStyles.barBg}>
        <View style={[gpStyles.barFill, { width: `${goalProgress}%`, backgroundColor: barColor }]} />
      </View>

      <View style={gpStyles.statsRow}>
        <View style={gpStyles.stat}>
          <Text style={[gpStyles.statValue, { color: pnlColor }]}>
            {monthPnl >= 0 ? '+' : ''}${monthPnl.toFixed(0)}
          </Text>
          <Text style={gpStyles.statLabel}>THIS MONTH</Text>
        </View>
        <View style={gpStyles.statDivider} />
        <View style={gpStyles.stat}>
          <Text style={[gpStyles.statValue, { color: barColor }]}>{goalProgress}%</Text>
          <Text style={gpStyles.statLabel}>OF TARGET</Text>
        </View>
        <View style={gpStyles.statDivider} />
        <View style={gpStyles.stat}>
          <Text style={[gpStyles.statValue, { color: colors.text }]}>${target.toFixed(0)}</Text>
          <Text style={gpStyles.statLabel}>TARGET</Text>
        </View>
        <View style={gpStyles.statDivider} />
        <View style={gpStyles.stat}>
          <Text style={[gpStyles.statValue, { color: colors.blue }]}>{monthTrades}</Text>
          <Text style={gpStyles.statLabel}>TRADES</Text>
        </View>
      </View>

      {monthTrades === 0 ? (
        <View style={gpStyles.messageRow}>
          <Ionicons name="information-circle" size={12} color={colors.muted} />
          <Text style={gpStyles.messageText}>
            No trades this month yet. Start logging to track progress.
          </Text>
        </View>
      ) : achieved ? (
        <View style={[gpStyles.messageRow, { backgroundColor: colors.green + '11' }]}>
          <Ionicons name="checkmark-circle" size={12} color={colors.green} />
          <Text style={[gpStyles.messageText, { color: colors.green }]}>
            Monthly goal achieved! Keep the discipline going.
          </Text>
        </View>
      ) : (
        <View style={gpStyles.messageRow}>
          <Ionicons name="trending-up" size={12} color={barColor} />
          <Text style={gpStyles.messageText}>
            ${Math.max(0, target - monthPnl).toFixed(0)} more needed to reach your target.
          </Text>
        </View>
      )}

      {lastMonthTrades > 0 && (
        <View style={gpStyles.lastMonthRow}>
          <Text style={gpStyles.lastMonthLabel}>{lastMonthName}:</Text>
          <Text style={[gpStyles.lastMonthValue, { color: lastPnlColor }]}>
            {lastMonthPnl >= 0 ? '+' : ''}${lastMonthPnl.toFixed(0)}
          </Text>
          <Text style={gpStyles.lastMonthLabel}>· {lastMonthTrades} trades</Text>
          {monthPnl !== 0 && lastMonthPnl !== 0 && (
            <View style={[gpStyles.compareBadge, {
              backgroundColor: monthPnl >= lastMonthPnl ? colors.green + '18' : colors.red + '18',
            }]}>
              <Ionicons
                name={monthPnl >= lastMonthPnl ? 'trending-up' : 'trending-down'}
                size={10}
                color={monthPnl >= lastMonthPnl ? colors.green : colors.red}
              />
              <Text style={[gpStyles.compareText, {
                color: monthPnl >= lastMonthPnl ? colors.green : colors.red,
              }]}>
                {monthPnl >= lastMonthPnl ? '+' : ''}
                {((monthPnl - lastMonthPnl) / Math.abs(lastMonthPnl) * 100).toFixed(0)}%
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const gpStyles = StyleSheet.create({
  card:          { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  header:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  iconBg:        { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:         { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, flex: 1 },
  achievedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.green + '18', borderWidth: 0.5, borderColor: colors.green + '44', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  achievedText:  { fontFamily: font.mono, fontSize: 8, color: colors.green, fontWeight: '700' },
  barBg:         { height: 8, backgroundColor: colors.surface2, borderRadius: 4, overflow: 'hidden', marginBottom: spacing.sm },
  barFill:       { height: 8, borderRadius: 4 },
  statsRow:      { flexDirection: 'row', marginBottom: spacing.sm },
  stat:          { flex: 1, alignItems: 'center' },
  statValue:     { fontFamily: font.mono, fontSize: 14, fontWeight: '800', marginBottom: 2 },
  statLabel:     { fontFamily: font.mono, fontSize: 7, color: colors.muted, letterSpacing: 1 },
  statDivider:   { width: 0.5, backgroundColor: colors.border, alignSelf: 'stretch', marginHorizontal: spacing.xs },
  messageRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.xs },
  messageText:   { flex: 1, fontFamily: font.mono, fontSize: 10, color: colors.muted, lineHeight: 15 },
  lastMonthRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  lastMonthLabel: { fontFamily: font.mono, fontSize: 9, color: colors.muted },
  lastMonthValue: { fontFamily: font.mono, fontSize: 10, fontWeight: '700' },
  compareBadge:  { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: radius.pill, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 4 },
  compareText:   { fontFamily: font.mono, fontSize: 9, fontWeight: '700' },
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════

export default function MoreScreen() {
  const router = useRouter();
  const { accent, accentKey, setAccent, pinEnabled } = useAppContext();

  const [toastMsg, setToastMsg]               = useState('');
  const [toastVisible, setToastVisible]       = useState(false);
  const [exporting, setExporting]             = useState(false);
  const [tradesCount, setTradesCount]         = useState(0);
  const [goals, setGoals]                     = useState<Goals | null>(null);
  const [monthPnl, setMonthPnl]               = useState(0);
  const [monthTrades, setMonthTrades]         = useState(0);
  const [lastMonthPnl, setLastMonthPnl]       = useState(0);
  const [lastMonthTrades, setLastMonthTrades] = useState(0);

  useFocusEffect(
    useCallback(() => {
      loadTrades().then((trades) => {
        setTradesCount(trades.length);
        const stats = calcStats(trades);
        setMonthPnl(stats.thisMonthPnl);
        setMonthTrades(stats.thisMonthTrades);
        setLastMonthPnl(stats.lastMonthPnl);
        setLastMonthTrades(stats.lastMonthTrades);
      });
      loadGoals().then(setGoals);
    }, [])
  );

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(false);
    setTimeout(() => setToastVisible(true), 50);
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      await exportTrades();
      showToast('PDF exported successfully');
    } catch (e: any) {
      Alert.alert('Export Failed', e.message);
    } finally {
      setExporting(false);
    }
  };

  const ACCENT_OPTIONS: { key: AccentColor; label: string }[] = [
    { key: 'green',  label: 'Green'  },
    { key: 'blue',   label: 'Blue'   },
    { key: 'purple', label: 'Purple' },
    { key: 'amber',  label: 'Amber'  },
    { key: 'red',    label: 'Red'    },
  ];

  const handleAccentChange = () => {
    Alert.alert(
      'Accent Color',
      'Choose your accent color',
      [
        ...ACCENT_OPTIONS.map((opt) => ({
          text: `${opt.label}${accentKey === opt.key ? ' ✓' : ''}`,
          onPress: async () => {
            await setAccent(opt.key);
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            showToast(`Accent: ${opt.label}`);
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={[styles.headerBadge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
            <Text style={[styles.headerBadgeText, { color: accent }]}>TRADE PROTOCOL</Text>
          </View>
          <Text style={styles.headerTitle}>More</Text>
          <Text style={styles.headerSub}>{tradesCount} trades logged</Text>
        </View>

        {/* ── Goals Progress Card ──────────────────────────────────────── */}
        {goals && (
          <GoalsProgressCard
            goals={goals}
            monthPnl={monthPnl}
            monthTrades={monthTrades}
            lastMonthPnl={lastMonthPnl}
            lastMonthTrades={lastMonthTrades}
            accent={accent}
            onPress={() => router.push('/screens/GoalsScreen')}
          />
        )}

        {/* ── Analytics & Tools ────────────────────────────────────────── */}
        <SectionHeader label="ANALYTICS & TOOLS" />

        <MenuItem
          icon="bar-chart"
          label="Deep Analytics"
          desc="Strategy, session & timeframe breakdown"
          color={colors.blue}
          onPress={() => router.push('/screens/AnalyticsScreen')}
        />
        <MenuItem
          icon="trending-up"
          label="Discipline Trend"
          desc="Your discipline score over time"
          color={colors.green}
          onPress={() => router.push('/screens/DisciplineTrendScreen')}
        />
        <MenuItem
          icon="calculator"
          label="Risk Calculator"
          desc="Calculate lot size from account risk"
          color={colors.amber}
          onPress={() => router.push('/screens/RiskCalculatorScreen')}
        />
        <MenuItem
          icon="time"
          label="Trade Timeline"
          desc="Visual journey of all your trades"
          color={colors.purple}
          onPress={() => router.push('/screens/TimelineScreen')}
        />

        {/* ── Gallery ──────────────────────────────────────────────────── */}
        <SectionHeader label="GALLERY" />

        <MenuItem
          icon="images-outline"
          label="Trading Gallery"
          desc="Chart screenshots, patterns & setups"
          color="#4fc3f7"
          onPress={() => router.push('/screens/GalleryScreen')}
        />

        {/* ── Goals & Targets ──────────────────────────────────────────── */}
        <SectionHeader label="GOALS & TARGETS" />

        <MenuItem
          icon="flag"
          label="Goals & Targets"
          desc="Set monthly P&L, win rate & discipline goals"
          color={colors.green}
          onPress={() => router.push('/screens/GoalsScreen')}
        />

        {/* ── Import & Restore ─────────────────────────────────────────── */}
        {/* Both options go to the same ImportScreen                        */}
        {/* ImportScreen has Restore Backup at top + MT4/MT5 below          */}
        <SectionHeader label="IMPORT & RESTORE" />

        <MenuItem
          icon="refresh-circle-outline"
          label="Restore Backup"
          desc="Import trades from a JSON backup after a journey reset"
          color={colors.green}
          onPress={() => router.push('/screens/ImportScreen')}
        />
        <MenuItem
          icon="cloud-download"
          label="Import from MT4 / MT5"
          desc="Import trade history from your broker statement"
          color={colors.blue}
          onPress={() => router.push('/screens/ImportScreen')}
        />

        {/* ── Export & Backup ───────────────────────────────────────────── */}
        <SectionHeader label="EXPORT & BACKUP" />

        <MenuItem
          icon="document-text"
          label={exporting ? 'Generating PDF...' : 'Export Journal as PDF'}
          desc="Full trade journal with stats and rules"
          color={colors.red}
          onPress={handleExport}
        />
        <MenuItem
          icon="download"
          label="Export as CSV"
          desc="Spreadsheet format for Excel / Google Sheets"
          color={colors.blue}
          onPress={() => router.push('/screens/SettingsScreen')}
        />

        {/* ── Settings ─────────────────────────────────────────────────── */}
        <SectionHeader label="SETTINGS" />

        <MenuItem
          icon="color-palette"
          label="Accent Color"
          desc={`Current: ${accentKey.charAt(0).toUpperCase() + accentKey.slice(1)}`}
          color={accent}
          onPress={handleAccentChange}
        />
        <MenuItem
          icon="notifications"
          label="Notifications"
          desc="Daily reminders and weekly review alerts"
          color={colors.amber}
          onPress={() => router.push('/screens/SettingsScreen')}
        />
        <MenuItem
          icon="lock-closed"
          label="App Lock"
          desc={pinEnabled ? 'PIN enabled — tap to change' : 'Set a PIN to protect your journal'}
          color={colors.purple}
          onPress={() => router.push('/screens/PinScreen')}
          badge={pinEnabled ? 'ON' : undefined}
        />
        <MenuItem
          icon="settings"
          label="All Settings"
          desc="Notifications, data management, about"
          color={colors.muted}
          onPress={() => router.push('/screens/SettingsScreen')}
        />

        {/* ── App Info ─────────────────────────────────────────────────── */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>TRADE PROTOCOL v1.0.0</Text>
          <Text style={styles.appInfoSub}>Trading Psychology OS</Text>
          <Text style={styles.appInfoSub}>Built for disciplined traders</Text>
        </View>
      </ScrollView>

      <Toast message={toastMsg} visible={toastVisible} />
    </SafeAreaView>
  );
}

// ── Styles — unchanged ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.bg },
  scroll:  { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 120 },

  header:          { marginBottom: spacing.md },
  headerBadge:     { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: spacing.sm },
  headerBadgeText: { fontFamily: font.mono, fontSize: 8, letterSpacing: 1.5 },
  headerTitle:     { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: 0.5, marginBottom: 4 },
  headerSub:       { fontFamily: font.mono, fontSize: 11, color: colors.muted },

  appInfo:    { alignItems: 'center', padding: spacing.xl, marginTop: spacing.lg },
  appInfoText: { fontFamily: font.mono, fontSize: 11, color: colors.muted, letterSpacing: 1.5, marginBottom: 4 },
  appInfoSub:  { fontFamily: font.mono, fontSize: 10, color: colors.muted, opacity: 0.5, marginTop: 2 },
});