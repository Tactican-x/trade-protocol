import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns'; // Production-safe date formatting
import { loadTrades, Trade } from '../store/trades';
import { colors, font, spacing, radius } from '../theme';
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

export default function TimelineScreen() {
  const { accent } = useAppContext();
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);

  // ── Currency & Cent States ─────────────────────────────────────────────────
  const [currencyCode, setCurrencyCode]   = useState('USD');
  const [isCentAccount, setIsCentAccount] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        loadTrades(),
        AsyncStorage.getItem('@currency'),
        AsyncStorage.getItem('@is_cent_account'),
      ]).then(([t, storedCur, storedCent]) => {
        // Chronological sort: newest first
        const sorted = [...t].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setTrades(sorted);
        setCurrencyCode(storedCur || 'USD');
        setIsCentAccount(storedCent === 'true');
      });
    }, [])
  );

  const currencySymbol = useMemo(() => {
    return CURRENCY_SYMBOLS[currencyCode] || '$';
  }, [currencyCode]);

  // Unified formatting utility supporting normal / Cent Modes
  const formatCurrencyValue = useCallback((n: number, compact = false) => {
    const abs = Math.abs(n);
    const sign = n >= 0 ? '+' : '-';
    
    if (isCentAccount) {
      return `${sign}${Math.round(abs).toLocaleString('en-US')} USC`;
    }
    
    const formattedNum = abs.toLocaleString('en-US', {
      minimumFractionDigits: compact ? 0 : 2,
      maximumFractionDigits: compact ? 0 : 2,
    });
    return `${sign}${currencySymbol}${formattedNum}`;
  }, [isCentAccount, currencySymbol]);

  if (trades.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Trade Timeline' }} />
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyEmoji}>📅</Text>
          <Text style={styles.emptyTitle}>No trades yet</Text>
          <Text style={styles.emptyText}>Your trading timeline will appear here</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Group by month
  const grouped = new Map<string, Trade[]>();
  for (const t of trades) {
    const d = new Date(t.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }

  const months = Array.from(grouped.entries()).map(([key, ts]) => {
    const [year, month] = key.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    const label = format(date, 'MMMM yyyy'); // Production Safe
    const pnl = ts.reduce((s, t) => s + t.pnl, 0);
    const wins = ts.filter((t) => t.result === 'win').length;
    const losses = ts.filter((t) => t.result === 'loss').length;
    return { key, label, trades: ts, pnl, wins, losses };
  });

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Trade Timeline' }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <Ionicons name="time" size={20} color={accent} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Trading Journey</Text>
            <Text style={styles.headerSub}>
              {trades.length} trades across {months.length} month{months.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* Cent Account Warning Banner */}
        {isCentAccount && (
          <View style={styles.centTrackerBanner}>
            <Ionicons name="sparkles" size={13} color={colors.amber} />
            <Text style={styles.centTrackerBannerText}>
              CENT ACCOUNT TRACKING ACTIVE (USC MODE)
            </Text>
          </View>
        )}

        {months.map((month) => {
          const pnlColor = month.pnl > 0 ? colors.green : month.pnl < 0 ? colors.red : colors.muted;
          return (
            <View key={month.key} style={styles.monthBlock}>
              {/* Month header */}
              <View style={styles.monthHeader}>
                <View style={[styles.monthDot, { backgroundColor: accent }]} />
                <View style={styles.monthLine} />
                <View style={styles.monthInfo}>
                  <Text style={styles.monthLabel}>{month.label}</Text>
                  <View style={styles.monthStats}>
                    <Text style={styles.monthCount}>{month.trades.length} trades</Text>
                    <Text style={styles.monthDivider}> · </Text>
                    <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.green }}>{month.wins}W</Text>
                    <Text style={styles.monthDivider}> / </Text>
                    <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.red }}>{month.losses}L</Text>
                    <Text style={styles.monthDivider}> · </Text>
                    <Text style={[styles.monthPnl, { color: pnlColor }]}>
                      {formatCurrencyValue(month.pnl, true)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Trades in month */}
              <View style={styles.tradesBlock}>
                {month.trades.map((trade, ti) => {
                  const tpnlColor = trade.pnl > 0 ? colors.green : trade.pnl < 0 ? colors.red : colors.muted;
                  const resColor = trade.result === 'win' ? colors.green : trade.result === 'loss' ? colors.red : trade.result === 'be' ? colors.amber : colors.blue;
                  const isLast = ti === month.trades.length - 1;

                  return (
                    <TouchableOpacity
                      key={trade.id}
                      onPress={() => router.push({ pathname: '/screens/TradeDetailScreen', params: { id: String(trade.id) } })}
                      activeOpacity={0.7}
                      style={styles.tradeRow}
                    >
                      {/* Timeline line */}
                      <View style={styles.timelineLine}>
                        <View style={[styles.tradeDot, { backgroundColor: resColor }]} />
                        {!isLast && <View style={styles.tradeConnector} />}
                      </View>

                      {/* Trade info */}
                      <View style={[styles.tradeCard, { borderLeftColor: resColor + '66' }]}>
                        <View style={styles.tradeCardHeader}>
                          <Text style={styles.tradePair}>{trade.pair} {trade.dir}</Text>
                          <View style={[styles.resBadge, { backgroundColor: resColor + '22', borderColor: resColor + '55' }]}>
                            <Text style={[styles.resBadgeText, { color: resColor }]}>
                              {trade.result.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.tradeCardMeta}>
                          <Text style={styles.tradeMeta}>{trade.dateStr} · {trade.timeStr}</Text>
                          <Text style={styles.tradeMeta}>{trade.session} · {trade.strategy}</Text>
                        </View>
                        <View style={styles.tradeCardFooter}>
                          <Text style={[styles.tradePnl, { color: tpnlColor }]}>
                            {formatCurrencyValue(trade.pnl)}
                          </Text>
                          <View style={styles.discBar}>
                            <View
                              style={[
                                styles.discFill,
                                {
                                  width: `${trade.ruleScore}%`,
                                  backgroundColor: trade.ruleScore >= 80 ? colors.green : trade.ruleScore >= 60 ? colors.amber : colors.red,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.discPct}>{Math.round(trade.ruleScore)}%</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 60 },

  emptyBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptyText: { fontFamily: font.mono, fontSize: 11, color: colors.muted, textAlign: 'center' },

  headerCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  headerText: { flex: 1 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 2 },
  headerSub: { fontFamily: font.mono, fontSize: 10, color: colors.muted },

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

  monthBlock: { marginBottom: spacing.lg },
  monthHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  monthDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, marginRight: spacing.sm },
  monthLine: { width: 0.5, backgroundColor: colors.border, alignSelf: 'stretch', marginRight: spacing.sm },
  monthInfo: { flex: 1 },
  monthLabel: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  monthStats: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  monthCount: { fontFamily: font.mono, fontSize: 10, color: colors.muted },
  monthDivider: { fontFamily: font.mono, fontSize: 10, color: colors.muted },
  monthPnl: { fontFamily: font.mono, fontSize: 10, fontWeight: '700' },

  tradesBlock: { marginLeft: 24 },
  tradeRow: { flexDirection: 'row', marginBottom: spacing.sm },
  timelineLine: { alignItems: 'center', marginRight: spacing.sm, width: 16 },
  tradeDot: { width: 8, height: 8, borderRadius: 4 },
  tradeConnector: { flex: 1, width: 0.5, backgroundColor: colors.border, marginTop: 2 },

  tradeCard: { flex: 1, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderLeftWidth: 3, borderRadius: radius.sm, padding: spacing.sm },
  tradeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  tradePair: { color: colors.text, fontSize: 13, fontWeight: '700', fontFamily: font.mono },
  resBadge: { borderWidth: 0.5, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  resBadgeText: { fontFamily: font.mono, fontSize: 8, fontWeight: '700' },
  tradeCardMeta: { marginBottom: 6 },
  tradeMeta: { fontFamily: font.mono, fontSize: 9, color: colors.muted, lineHeight: 14 },
  tradeCardFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tradePnl: { fontFamily: font.mono, fontSize: 12, fontWeight: '800', minWidth: 65 }, // Flexible width
  discBar: { flex: 1, height: 4, backgroundColor: colors.surface2, borderRadius: 2, overflow: 'hidden' },
  discFill: { height: 4, borderRadius: 2 },
  discPct: { fontFamily: font.mono, fontSize: 9, color: colors.muted, width: 30, textAlign: 'right' },
});