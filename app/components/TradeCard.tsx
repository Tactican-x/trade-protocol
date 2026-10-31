import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Trade } from '../store/trades';
import { colors, font, spacing, radius, cardStyle } from '../theme';
import { ResultBadge } from './UI';
import { getRulesForMode } from '../store/rules';

interface TradeCardProps {
  trade:   Trade;
  onPress: () => void;
}

export function TradeCard({ trade, onPress }: TradeCardProps) {
  const pnlColor =
    trade.pnl > 0 ? colors.green :
    trade.pnl < 0 ? colors.red   :
    colors.muted;

  const pnlStr =
    trade.pnl > 0 ? `+$${trade.pnl.toFixed(2)}`          :
    trade.pnl < 0 ? `-$${Math.abs(trade.pnl).toFixed(2)}` :
    '$0.00';

  // ✅ Mode-aware — only show rules applicable to this trade's checklist
  // Legacy trades (no mode) default to full
  const applicableRules = getRulesForMode(trade.mode ?? 'full');
  const followedRules   = applicableRules.filter((r) => trade.rules.includes(r));
  const shownTags       = followedRules.slice(0, 2);
  const moreCount       = followedRules.length - 2;

  // ✅ Mode badge config
  const isPro      = trade.mode === 'pro';
  const modeColor  = isPro ? colors.green : colors.blue;
  const modeLabel  = isPro ? '⚡ PRO' : '◈ FULL';

  const scoreColor =
    trade.ruleScore >= 80 ? colors.green :
    trade.ruleScore >= 60 ? colors.amber :
    colors.red;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View style={[cardStyle, styles.card]}>

        {/* ── Top row ─────────────────────────────────────────────────── */}
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <Text style={styles.pair}>{trade.pair}</Text>
            <View
              style={[
                styles.dirBadge,
                {
                  backgroundColor: trade.dir === 'BUY' ? colors.green + '22' : colors.red + '22',
                  borderColor:     trade.dir === 'BUY' ? colors.green + '66' : colors.red + '66',
                },
              ]}
            >
              <Text
                style={[
                  styles.dirText,
                  { color: trade.dir === 'BUY' ? colors.green : colors.red },
                ]}
              >
                {trade.dir}
              </Text>
            </View>
            <Text style={styles.timeframe}>{trade.timeframe}</Text>

            {/* ✅ Mode badge */}
            <View style={[styles.modeBadge, { backgroundColor: modeColor + '15', borderColor: modeColor + '44' }]}>
              <Text style={[styles.modeText, { color: modeColor }]}>
                {modeLabel}
              </Text>
            </View>
          </View>
          <ResultBadge result={trade.result} />
        </View>

        {/* ── Meta row ────────────────────────────────────────────────── */}
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{trade.dateStr}</Text>
          <Text style={styles.metaDot}> · </Text>
          <Text style={styles.meta}>{trade.timeStr}</Text>
          <Text style={styles.metaDot}> · </Text>
          <Text style={styles.meta}>{trade.session}</Text>
          <Text style={styles.metaDot}> · </Text>
          <Text style={styles.meta}>{trade.strategy}</Text>
        </View>

        {/* ── Bottom row — P&L + discipline ───────────────────────────── */}
        <View style={styles.bottomRow}>
          <Text style={[styles.pnl, { color: pnlColor }]}>{pnlStr}</Text>
          <View style={styles.discRow}>
            <View style={styles.discBarBg}>
              <View
                style={[
                  styles.discBarFill,
                  {
                    width:           `${Math.min(100, trade.ruleScore)}%` as any,
                    backgroundColor: scoreColor,
                  },
                ]}
              />
            </View>
            {/* ✅ Shows x/10 or x/25 depending on mode */}
            <Text style={[styles.discPct, { color: scoreColor }]}>
              {Math.round(trade.ruleScore)}%
            </Text>
            <Text style={styles.ruleCount}>
              {followedRules.length}/{applicableRules.length}
            </Text>
          </View>
        </View>

        {/* ── Tags row ────────────────────────────────────────────────── */}
        {followedRules.length > 0 && (
          <View style={styles.tagsRow}>
            {shownTags.map((r, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagText} numberOfLines={1}>{r}</Text>
              </View>
            ))}
            {moreCount > 0 && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>+{moreCount} more</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },

  // Top row
  topRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   6,
  },
  topLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    flex:          1,
  },
  pair: {
    color:         colors.text,
    fontSize:      15,
    fontWeight:    '800',
    fontFamily:    font.mono,
    letterSpacing: 0.3,
  },
  dirBadge: {
    borderWidth:       0.5,
    borderRadius:      radius.pill,
    paddingHorizontal: 6,
    paddingVertical:   2,
  },
  dirText: {
    fontFamily:    font.mono,
    fontSize:      9,
    fontWeight:    '700',
    letterSpacing: 0.5,
  },
  timeframe: {
    fontFamily: font.mono,
    fontSize:   10,
    color:      colors.muted,
  },

  // ✅ Mode badge
  modeBadge: {
    borderWidth:       0.5,
    borderRadius:      radius.pill,
    paddingHorizontal: 5,
    paddingVertical:   2,
  },
  modeText: {
    fontFamily:    font.mono,
    fontSize:      8,
    fontWeight:    '700',
    letterSpacing: 0.3,
  },

  // Meta row
  metaRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    alignItems:    'center',
    marginBottom:  8,
  },
  meta:    { fontFamily: font.mono, fontSize: 10, color: colors.muted },
  metaDot: { color: colors.muted, fontSize: 10, fontFamily: font.mono },

  // Bottom row
  bottomRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   6,
  },
  pnl: {
    fontFamily: font.mono,
    fontSize:   16,
    fontWeight: '800',
  },
  discRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  discBarBg: {
    width:           60,
    height:          4,
    backgroundColor: colors.surface2,
    borderRadius:    2,
    overflow:        'hidden',
  },
  discBarFill: {
    height:       4,
    borderRadius: 2,
  },
  discPct: {
    fontFamily: font.mono,
    fontSize:   10,
    fontWeight: '700',
    width:      32,
    textAlign:  'right',
  },

  // ✅ Rule count x/10 or x/25
  ruleCount: {
    fontFamily: font.mono,
    fontSize:   9,
    color:      colors.muted,
    opacity:    0.7,
  },

  // Tags row
  tagsRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           4,
  },
  tag: {
    backgroundColor: colors.purple + '22',
    borderWidth:     0.5,
    borderColor:     colors.purple + '55',
    borderRadius:    radius.pill,
    paddingHorizontal: 8,
    paddingVertical:   2,
    maxWidth:          140,
  },
  tagText: {
    fontFamily: font.mono,
    fontSize:   9,
    color:      colors.purple,
  },
});