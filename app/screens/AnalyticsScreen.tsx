import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { loadTrades, Trade } from '../store/trades';
import { colors, font, spacing, radius } from '../theme';
import { useAppContext } from '../context/AppContext';

// ── Section Divider ───────────────────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <View style={divStyles.row}>
      <View style={divStyles.line} />
      <Text style={divStyles.label}>{label}</Text>
      <View style={divStyles.line} />
    </View>
  );
}
const divStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md },
  line: { flex: 1, height: 0.5, backgroundColor: colors.border },
  label: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginHorizontal: spacing.sm },
});

// ── Bar Row ───────────────────────────────────────────────────────────────────
function BarRow({
  label, value, maxValue, pnl, count, winRate, color,
}: {
  label: string; value: number; maxValue: number;
  pnl: number; count: number; winRate: number; color: string;
}) {
  const barW = maxValue > 0 ? Math.max(4, (value / maxValue) * 100) : 0;
  const pnlColor = pnl > 0 ? colors.green : pnl < 0 ? colors.red : colors.muted;

  return (
    <View style={barStyles.row}>
      <Text style={barStyles.label}>{label}</Text>
      <View style={barStyles.barContainer}>
        <View style={barStyles.barBg}>
          <View style={[barStyles.barFill, { width: `${barW}%`, backgroundColor: color }]} />
        </View>
        <View style={barStyles.stats}>
          <Text style={barStyles.count}>{count}t</Text>
          <Text style={[barStyles.wr, { color: winRate >= 50 ? colors.green : colors.red }]}>
            {winRate}%
          </Text>
          <Text style={[barStyles.pnl, { color: pnlColor }]}>
            {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)}
          </Text>
        </View>
      </View>
    </View>
  );
}
const barStyles = StyleSheet.create({
  row: { marginBottom: spacing.sm },
  label: { fontFamily: font.mono, fontSize: 10, color: colors.text, fontWeight: '600', marginBottom: 4 },
  barContainer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barBg: { flex: 1, height: 8, backgroundColor: colors.surface2, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  stats: { flexDirection: 'row', gap: spacing.sm, width: 120, justifyContent: 'flex-end' },
  count: { fontFamily: font.mono, fontSize: 9, color: colors.muted, width: 25 },
  wr: { fontFamily: font.mono, fontSize: 9, fontWeight: '700', width: 35 },
  pnl: { fontFamily: font.mono, fontSize: 9, fontWeight: '700', width: 40, textAlign: 'right' },
});

// ── Analytics computation ─────────────────────────────────────────────────────
interface GroupStats {
  label: string;
  count: number;
  wins: number;
  losses: number;
  pnl: number;
  winRate: number;
  avgDisc: number;
}

function groupBy(trades: Trade[], key: keyof Trade): GroupStats[] {
  const map = new Map<string, Trade[]>();
  for (const t of trades) {
    const k = String(t[key]);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(t);
  }
  return Array.from(map.entries()).map(([label, ts]) => {
    const closed = ts.filter((t) => t.result === 'win' || t.result === 'loss');
    const wins = ts.filter((t) => t.result === 'win').length;
    const losses = ts.filter((t) => t.result === 'loss').length;
    const pnl = ts.reduce((s, t) => s + t.pnl, 0);
    const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0;
    const avgDisc = ts.length > 0 ? Math.round(ts.reduce((s, t) => s + t.ruleScore, 0) / ts.length) : 0;
    return { label, count: ts.length, wins, losses, pnl, winRate, avgDisc };
  }).sort((a, b) => b.pnl - a.pnl);
}

// ── Stat Box ──────────────────────────────────────────────────────────────────
function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={sbStyles.box}>
      <Text style={[sbStyles.value, { color }]}>{value}</Text>
      <Text style={sbStyles.label}>{label}</Text>
    </View>
  );
}
const sbStyles = StyleSheet.create({
  box: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center' },
  value: { fontFamily: font.mono, fontSize: 18, fontWeight: '800', marginBottom: 2 },
  label: { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1, textAlign: 'center' },
});

// ── Trend Card Styles ─────────────────────────────────────────────────────────
const trendStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.green + '44',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.green + '08',
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconBg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  sub: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.muted,
    lineHeight: 15,
  },
});

// ══════════════════════════════════════════════════════════════════════════════
export default function AnalyticsScreen() {
  const { accent } = useAppContext();
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [activeTab, setActiveTab] = useState<'strategy' | 'session' | 'timeframe' | 'direction' | 'trend'>('strategy');

  useEffect(() => {
    loadTrades().then(setTrades);
  }, []);

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: 'strategy',  label: 'Strategy' },
    { key: 'session',   label: 'Session' },
    { key: 'timeframe', label: 'Timeframe' },
    { key: 'direction', label: 'Direction' },
    { key: 'trend',     label: 'Discipline' },
  ];

  const groups = activeTab !== 'trend'
    ? groupBy(trades, activeTab as keyof Trade)
    : [];
  const maxCount = groups.length > 0 ? Math.max(...groups.map((g) => g.count)) : 1;

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const closed = trades.filter((t) => t.result === 'win' || t.result === 'loss');
  const overallWR = closed.length > 0 ? Math.round((closed.filter((t) => t.result === 'win').length / closed.length) * 100) : 0;
  const avgDisc = trades.length > 0 ? Math.round(trades.reduce((s, t) => s + t.ruleScore, 0) / trades.length) : 0;

  const bestStrategy = [...groupBy(trades, 'strategy')].sort((a, b) => b.pnl - a.pnl)[0];
  const bestSession = [...groupBy(trades, 'session')].sort((a, b) => b.winRate - a.winRate)[0];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Deep Analytics' }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Overview Stats ───────────────────────────────────────────── */}
        <View style={styles.overviewRow}>
          <StatBox
            label="TOTAL TRADES"
            value={String(trades.length)}
            color={colors.blue}
          />
          <View style={{ width: spacing.xs }} />
          <StatBox
            label="WIN RATE"
            value={`${overallWR}%`}
            color={overallWR >= 50 ? colors.green : colors.red}
          />
          <View style={{ width: spacing.xs }} />
          <StatBox
            label="TOTAL P&L"
            value={`${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(0)}`}
            color={totalPnl >= 0 ? colors.green : colors.red}
          />
          <View style={{ width: spacing.xs }} />
          <StatBox
            label="AVG DISC"
            value={`${avgDisc}%`}
            color={avgDisc >= 80 ? colors.green : avgDisc >= 60 ? colors.amber : colors.red}
          />
        </View>

        {/* ── NEW: Monthly Archive Link ───────────────────────────────── */}
        <TouchableOpacity
          style={[trendStyles.card, { marginBottom: spacing.md, backgroundColor: colors.blue + '08', borderColor: colors.blue + '44' }]}
          onPress={() => router.push('/screens/MonthlyArchiveScreen')}
          activeOpacity={0.8}
        >
          <View style={trendStyles.left}>
            <View style={[trendStyles.iconBg, { backgroundColor: colors.blue + '18' }]}>
              <Ionicons name="calendar" size={24} color={colors.blue} />
            </View>
            <View style={trendStyles.text}>
              <Text style={trendStyles.title}>Monthly Performance</Text>
              <Text style={trendStyles.sub}>
                Browse your complete history and stats month by month.
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.blue} />
        </TouchableOpacity>

        {/* ── Insights ─────────────────────────────────────────────────── */}
        {(bestStrategy || bestSession) && (
          <View style={styles.insightsCard}>
            <View style={styles.insightsHeader}>
              <Ionicons name="bulb" size={14} color={colors.amber} />
              <Text style={styles.insightsTitle}>KEY INSIGHTS</Text>
            </View>
            {bestStrategy && (
              <View style={styles.insightRow}>
                <Ionicons name="star" size={12} color={colors.green} />
                <Text style={styles.insightText}>
                  Best strategy: <Text style={{ color: colors.green, fontWeight: '700' }}>{bestStrategy.label}</Text>
                  {' '}(+${bestStrategy.pnl.toFixed(0)}, {bestStrategy.winRate}% WR)
                </Text>
              </View>
            )}
            {bestSession && (
              <View style={styles.insightRow}>
                <Ionicons name="time" size={12} color={colors.blue} />
                <Text style={styles.insightText}>
                  Best session: <Text style={{ color: colors.blue, fontWeight: '700' }}>{bestSession.label}</Text>
                  {' '}({bestSession.winRate}% win rate)
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Tab Selector ─────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[
                  styles.tab,
                  active && { backgroundColor: accent + '18', borderColor: accent + '66' },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, active && { color: accent, fontWeight: '700' }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Content ──────────────────────────────────────────────────── */}
        {trades.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>No trades logged yet.</Text>
          </View>
        ) : activeTab === 'trend' ? (
          // ✅ updated: navigates to DisciplineTrendScreen instead of inline chart
          <TouchableOpacity
            onPress={() => router.push('/screens/DisciplineTrendScreen')}
            style={trendStyles.card}
            activeOpacity={0.8}
          >
            <View style={trendStyles.left}>
              <View style={[trendStyles.iconBg, { backgroundColor: colors.green + '18' }]}>
                <Ionicons name="shield-checkmark" size={24} color={colors.green} />
              </View>
              <View style={trendStyles.text}>
                <Text style={trendStyles.title}>Discipline Trend</Text>
                <Text style={trendStyles.sub}>
                  Full breakdown — trend chart, weekly averages, rule compliance, insights
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.green} />
          </TouchableOpacity>
        ) : groups.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>No data for this category.</Text>
          </View>
        ) : (
          <View style={styles.groupsCard}>
            <View style={styles.groupsHeader}>
              <Text style={styles.groupsHeaderLabel}>NAME</Text>
              <Text style={styles.groupsHeaderLabel}>TRADES · WR · P&L</Text>
            </View>
            {groups.map((g) => (
              <BarRow
                key={g.label}
                label={g.label}
                value={g.count}
                maxValue={maxCount}
                pnl={g.pnl}
                count={g.count}
                winRate={g.winRate}
                color={g.pnl >= 0 ? colors.green : colors.red}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 60 },

  overviewRow: { flexDirection: 'row', marginBottom: spacing.md },

  insightsCard: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  insightsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  insightsTitle: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5 },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  insightText: { flex: 1, fontFamily: font.mono, fontSize: 11, color: colors.text, lineHeight: 16 },

  tabsRow: { gap: spacing.xs, marginBottom: spacing.md, paddingBottom: 2 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface2 },
  tabText: { fontFamily: font.mono, fontSize: 11, color: colors.muted },

  groupsCard: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  groupsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  groupsHeaderLabel: { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1 },

  emptyBlock: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' },
  emptyText: { fontFamily: font.mono, fontSize: 12, color: colors.muted },
});