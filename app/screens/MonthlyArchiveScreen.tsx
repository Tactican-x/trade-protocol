import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { loadTrades, groupTradesByMonth, MonthStats, Trade } from '../store/trades';
import { colors, font, spacing, radius } from '../theme';

export default function MonthlyArchiveScreen() {
  const router = useRouter();
  const [months, setMonths] = useState<MonthStats[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadTrades().then((t) => setMonths(groupTradesByMonth(t)));
    }, [])
  );

  const openMonth = (monthKey: string) => {
    Haptics.selectionAsync();
    router.push({
      pathname: '/(tabs)/history',
      params: { month: monthKey },
    });
  };

  const formatPnl = (pnl: number) => {
    if (pnl > 0) return `+$${pnl.toFixed(0)}`;
    if (pnl < 0) return `-$${Math.abs(pnl).toFixed(0)}`;
    return '$0';
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <Stack.Screen 
        options={{ 
          title: 'Monthly Performance',
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackTitleVisible: false,
        }} 
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {months.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="calendar-outline" size={40} color={colors.muted} />
            <Text style={styles.emptyTitle}>No monthly data yet</Text>
            <Text style={styles.emptySub}>Your monthly performance cards will appear here as you log trades.</Text>
          </View>
        ) : (
          months.map((m) => {
            const pnlColor = m.totalPnl > 0 ? colors.green : m.totalPnl < 0 ? colors.red : colors.muted;
            const wrColor  = m.winRate >= 50 ? colors.green : colors.red;
            
            // Visual Win/Loss bar ratios
            const totalClosed = m.wins + m.losses;
            const winFlex  = totalClosed > 0 ? m.wins : 1;
            const lossFlex = totalClosed > 0 ? m.losses : 1;

            return (
              <TouchableOpacity
                key={m.key}
                style={styles.card}
                activeOpacity={0.8}
                onPress={() => openMonth(m.key)}
              >
                <View style={styles.headerRow}>
                  <View style={styles.headerLeft}>
                    <View style={styles.iconBg}>
                      <Ionicons name="calendar" size={14} color={colors.blue} />
                    </View>
                    <Text style={styles.monthLabel}>{m.label}</Text>
                  </View>
                  <Text style={[styles.pnl, { color: pnlColor }]}>{formatPnl(m.totalPnl)}</Text>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>TRADES</Text>
                    <Text style={styles.statVal}>{m.count}</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>WIN RATE</Text>
                    <Text style={[styles.statVal, { color: wrColor }]}>{m.winRate}%</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>AVG DISC</Text>
                    <Text style={styles.statVal}>{m.avgDiscipline}%</Text>
                  </View>
                </View>

                {/* Win/Loss Bar */}
                {totalClosed > 0 && (
                  <View style={styles.wlContainer}>
                    <View style={styles.wlLabels}>
                      <Text style={[styles.wlText, { color: colors.green }]}>{m.wins} Wins</Text>
                      <Text style={[styles.wlText, { color: colors.red }]}>{m.losses} Losses</Text>
                    </View>
                    <View style={styles.wlBar}>
                      {m.wins > 0 && <View style={[styles.wlFill, { flex: winFlex, backgroundColor: colors.green }]} />}
                      {m.losses > 0 && <View style={[styles.wlFill, { flex: lossFlex, backgroundColor: colors.red }]} />}
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 40 },
  
  emptyBox: { alignItems: 'center', marginTop: 60, padding: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 8 },
  emptySub: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20, fontFamily: font.mono },

  card: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBg: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.blue + '18', alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 16, fontWeight: '800', color: colors.text, letterSpacing: 0.5 },
  pnl: { fontSize: 18, fontWeight: '800', fontFamily: font.mono },

  statsRow: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md },
  statCol: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 9, color: colors.muted, fontFamily: font.mono, letterSpacing: 1 },
  statVal: { fontSize: 14, fontWeight: '800', color: colors.text, fontFamily: font.mono },
  divider: { width: 1, backgroundColor: colors.border, alignSelf: 'stretch' },

  wlContainer: { marginTop: spacing.xs },
  wlLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  wlText: { fontSize: 9, fontWeight: '700', fontFamily: font.mono },
  wlBar: { height: 6, flexDirection: 'row', borderRadius: 3, overflow: 'hidden', gap: 2, backgroundColor: colors.surface2 },
  wlFill: { height: '100%', borderRadius: 3 },
});