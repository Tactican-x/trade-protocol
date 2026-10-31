import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Line,
} from 'react-native-svg';
import { loadTrades, Trade } from '../store/trades';
import { ALL_RULES, PRO_RULES, getRulesForMode, getAllUniqueRules } from '../store/rules';
import { colors, font, spacing, radius } from '../theme';
import { useAppContext } from '../context/AppContext';

const { width } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  return score >= 80 ? colors.green : score >= 60 ? colors.amber : colors.red;
}

function scoreLabel(score: number): string {
  return score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : 'Needs Work';
}

// ─────────────────────────────────────────────────────────────────────────────
// Smooth curve helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function buildSmoothPath(
  points: { x: number; y: number }[],
  svgH: number
): string {
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

function buildAreaPath(
  points: { x: number; y: number }[],
  svgH: number
): string {
  if (points.length < 2) return '';
  const curvePath  = buildSmoothPath(points, svgH);
  const lastPoint  = points[points.length - 1];
  const firstPoint = points[0];
  return `${curvePath} L ${lastPoint.x.toFixed(2)} ${svgH} L ${firstPoint.x.toFixed(2)} ${svgH} Z`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Divider
// ─────────────────────────────────────────────────────────────────────────────

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
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    marginVertical: spacing.md,
  },
  line:  { flex: 1, height: 0.5, backgroundColor: colors.border },
  label: {
    fontFamily:       font.mono,
    fontSize:         9,
    color:            colors.muted,
    letterSpacing:    1.5,
    marginHorizontal: spacing.sm,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Overview Stat
// ─────────────────────────────────────────────────────────────────────────────

function OverviewStat({
  icon,
  label,
  value,
  color,
  sub,
}: {
  icon:   string;
  label:  string;
  value:  string;
  color:  string;
  sub?:   string;
}) {
  return (
    <View style={ovStyles.card}>
      <View style={[ovStyles.iconBg, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[ovStyles.value, { color }]}>{value}</Text>
      <Text style={ovStyles.label}>{label}</Text>
      {sub && <Text style={ovStyles.sub}>{sub}</Text>}
    </View>
  );
}

const ovStyles = StyleSheet.create({
  card: {
    flex:            1,
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    alignItems:      'center',
    gap:             4,
  },
  iconBg: {
    width:          32,
    height:         32,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   2,
  },
  value: {
    fontFamily: font.mono,
    fontSize:   22,
    fontWeight: '800',
  },
  label: {
    fontFamily:    font.mono,
    fontSize:      8,
    color:         colors.muted,
    letterSpacing: 1,
    textAlign:     'center',
  },
  sub: {
    fontFamily: font.mono,
    fontSize:   8,
    color:      colors.muted,
    opacity:    0.6,
    textAlign:  'center',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Trend Line Chart
// ─────────────────────────────────────────────────────────────────────────────

function TrendLineChart({
  trades,
  accent,
}: {
  trades: Trade[];
  accent: string;
}) {
  const last20 = [...trades].slice(0, 20).reverse();

  if (last20.length < 2) {
    return (
      <View style={lcStyles.empty}>
        <Ionicons name="analytics-outline" size={32} color={colors.muted} />
        <Text style={lcStyles.emptyText}>
          Log at least 2 trades to see your trend
        </Text>
      </View>
    );
  }

  // ── Dimensions ────────────────────────────────────────────────────────────
  const WRAPPER_W  = width - spacing.lg * 2 - spacing.md * 2 - 36;
  const DOT_R      = 4;
  const GLOW_R     = 7;
  const LABEL_H    = 18;
  const PAD_TOP    = LABEL_H + GLOW_R + 2;
  const PAD_BOTTOM = GLOW_R + 4;
  const PAD_LEFT   = GLOW_R + 2;
  const PAD_RIGHT  = GLOW_R + 2;
  const DRAW_H     = 120;
  const DRAW_W     = WRAPPER_W - PAD_LEFT - PAD_RIGHT;
  const SVG_H      = PAD_TOP + DRAW_H + PAD_BOTTOM;

  const avgScore = Math.round(
    last20.reduce((s, t) => s + t.ruleScore, 0) / last20.length
  );

  const trend =
    last20[last20.length - 1].ruleScore - last20[0].ruleScore;
  const trendColor =
    trend > 0 ? colors.green : trend < 0 ? colors.red : colors.muted;
  const trendIcon =
    trend > 5 ? 'trending-up' : trend < -5 ? 'trending-down' : 'remove';

  const avgColor = colors.blue;

  const pctToY = (pct: number) =>
    PAD_TOP + DRAW_H - (Math.min(100, Math.max(0, pct)) / 100) * DRAW_H;

  const points = last20.map((t, i) => {
    const x =
      PAD_LEFT +
      (last20.length > 1
        ? (i / (last20.length - 1)) * DRAW_W
        : DRAW_W / 2);
    const y = pctToY(t.ruleScore);
    return { x, y, score: t.ruleScore, pair: t.pair, result: t.result, mode: t.mode };
  });

  const curvePath = buildSmoothPath(points, SVG_H);
  const areaPath  = buildAreaPath(points, SVG_H);

  const avgY    = pctToY(avgScore);
  const threshY = pctToY(60);

  const gridLines = [25, 50, 75, 100];

  return (
    <View style={lcStyles.container}>
      {/* Header row */}
      <View style={lcStyles.header}>
        <View style={lcStyles.headerLeft}>
          <Text style={lcStyles.title}>SCORE PER TRADE</Text>
          <Text style={lcStyles.subtitle}>Last {last20.length} trades</Text>
        </View>

        {/* Average badge */}
        <View style={[lcStyles.avgBadge, { borderColor: avgColor + '40' }]}>
          <View style={[lcStyles.avgBadgeIcon, { backgroundColor: avgColor + '18' }]}>
            <Ionicons name="pulse" size={12} color={avgColor} />
          </View>
          <View>
            <Text style={[lcStyles.avgBadgeValue, { color: avgColor }]}>
              {avgScore}%
            </Text>
            <Text style={lcStyles.avgBadgeLabel}>AVG</Text>
          </View>
        </View>

        {/* Trend badge */}
        <View style={lcStyles.trendBadge}>
          <Ionicons name={trendIcon as any} size={14} color={trendColor} />
          <Text style={[lcStyles.trendText, { color: trendColor }]}>
            {trend > 0 ? '+' : ''}{Math.round(trend)}%
          </Text>
        </View>
      </View>

      {/* Chart wrapper */}
      <View style={lcStyles.chartWrapper}>
        {/* Y-axis labels */}
        <View style={lcStyles.yAxis}>
          {gridLines.map((pct) => (
            <Text
              key={pct}
              style={[lcStyles.yLabel, { top: pctToY(pct) - 6 }]}
            >
              {pct}
            </Text>
          ))}
        </View>

        {/* SVG canvas */}
        <Svg width={WRAPPER_W} height={SVG_H}>
          <Defs>
            <LinearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={accent} stopOpacity="0.28" />
              <Stop offset="1" stopColor={accent} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {gridLines.map((pct) => {
            const y = pctToY(pct);
            return (
              <Line
                key={pct}
                x1={PAD_LEFT}
                y1={y}
                x2={PAD_LEFT + DRAW_W}
                y2={y}
                stroke={colors.border}
                strokeWidth={0.5}
                opacity={0.6}
              />
            );
          })}

          {/* 60% threshold dashed line */}
          <Line
            x1={PAD_LEFT}
            y1={threshY}
            x2={PAD_LEFT + DRAW_W}
            y2={threshY}
            stroke={colors.red}
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.4}
          />

          {/* Average dashed line */}
          <Line
            x1={PAD_LEFT}
            y1={avgY}
            x2={PAD_LEFT + DRAW_W}
            y2={avgY}
            stroke={avgColor}
            strokeWidth={1}
            strokeDasharray="6 3"
            opacity={0.4}
          />

          {/* Gradient area fill */}
          {areaPath ? <Path d={areaPath} fill="url(#curveGrad)" /> : null}

          {/* Smooth curve line */}
          {curvePath ? (
            <Path
              d={curvePath}
              stroke={accent}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {/* Dots — shape indicates mode */}
          {points.map((p, i) => {
            const dotColor = scoreColor(p.score);
            const isPro    = p.mode === 'pro';
            return (
              <React.Fragment key={`dot-${i}`}>
                <Circle cx={p.x} cy={p.y} r={GLOW_R} fill={dotColor} opacity={0.12} />
                <Circle cx={p.x} cy={p.y} r={DOT_R}  fill={dotColor} />
                {/* Inner marker — solid for pro, hollow for full */}
                <Circle
                  cx={p.x}
                  cy={p.y}
                  r={isPro ? 1.2 : 1.8}
                  fill={isPro ? colors.green : colors.surface}
                />
              </React.Fragment>
            );
          })}
        </Svg>

        {/* Score labels above dots */}
        {points.map((p, i) => (
          <Text
            key={`label-${i}`}
            style={[
              lcStyles.scoreLabel,
              {
                left:  p.x - 10,
                top:   p.y - LABEL_H - GLOW_R + 2,
                color: scoreColor(p.score),
              },
            ]}
          >
            {Math.round(p.score)}
          </Text>
        ))}

        {/* Avg line label */}
        <View style={[lcStyles.avgLineTag, { top: avgY - 10 }]}>
          <View style={[lcStyles.avgLineTagDot, { backgroundColor: avgColor }]} />
          <Text style={[lcStyles.avgLineTagText, { color: avgColor }]}>avg</Text>
        </View>

        {/* Threshold label */}
        <Text style={[lcStyles.threshLabel, { top: threshY - 14 }]}>60%</Text>
      </View>

      {/* Legend */}
      <View style={lcStyles.legend}>
        <View style={lcStyles.legendItem}>
          <View style={[lcStyles.legendDot, { backgroundColor: colors.green }]} />
          <Text style={lcStyles.legendText}>80%+ Excellent</Text>
        </View>
        <View style={lcStyles.legendItem}>
          <View style={[lcStyles.legendDot, { backgroundColor: colors.amber }]} />
          <Text style={lcStyles.legendText}>60-79% Good</Text>
        </View>
        <View style={lcStyles.legendItem}>
          <View style={[lcStyles.legendDot, { backgroundColor: colors.red }]} />
          <Text style={lcStyles.legendText}>{'<'}60% Low</Text>
        </View>
        <View style={lcStyles.legendItem}>
          <View style={[lcStyles.legendDash, { backgroundColor: colors.blue }]} />
          <Text style={lcStyles.legendText}>Average</Text>
        </View>
      </View>

      {/* Mode legend */}
      <View style={lcStyles.modeLegendRow}>
        <View style={lcStyles.legendItem}>
          <View style={[lcStyles.modeDot, { borderColor: colors.green }]}>
            <View style={[lcStyles.modeDotInner, { backgroundColor: colors.green }]} />
          </View>
          <Text style={lcStyles.legendText}>⚡ Pro (10 rules)</Text>
        </View>
        <View style={lcStyles.legendItem}>
          <View style={[lcStyles.modeDot, { borderColor: colors.muted }]}>
            <View style={[lcStyles.modeDotInner, { backgroundColor: colors.surface }]} />
          </View>
          <Text style={lcStyles.legendText}>◈ Full (25 rules)</Text>
        </View>
      </View>
    </View>
  );
}

const lcStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  spacing.md,
    gap:           spacing.sm,
  },
  headerLeft: { flex: 1 },
  title: {
    fontFamily:    font.mono,
    fontSize:      9,
    color:         colors.muted,
    letterSpacing: 1.5,
    marginBottom:  2,
  },
  subtitle: {
    fontFamily: font.mono,
    fontSize:   9,
    color:      colors.muted,
    opacity:    0.6,
  },

  // Average badge
  avgBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   colors.surface2,
    borderWidth:       1,
    borderRadius:      radius.lg,
    paddingHorizontal: 10,
    paddingVertical:   6,
  },
  avgBadgeIcon: {
    width:          24,
    height:         24,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
  },
  avgBadgeValue: {
    fontFamily: font.mono,
    fontSize:   14,
    fontWeight: '800',
    lineHeight: 16,
  },
  avgBadgeLabel: {
    fontFamily:    font.mono,
    fontSize:      7,
    color:         colors.muted,
    letterSpacing: 1,
    lineHeight:    10,
  },

  // Trend badge
  trendBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    backgroundColor:   colors.surface2,
    borderRadius:      radius.pill,
    paddingHorizontal: 10,
    paddingVertical:   4,
  },
  trendText: {
    fontFamily: font.mono,
    fontSize:   12,
    fontWeight: '800',
  },

  // Chart
  chartWrapper: {
    position:     'relative',
    marginBottom: spacing.sm,
    marginLeft:   36,
  },
  yAxis: {
    position: 'absolute',
    left:     -34,
    top:      0,
    bottom:   0,
    width:    30,
  },
  yLabel: {
    position:   'absolute',
    right:      2,
    fontFamily: font.mono,
    fontSize:   7,
    color:      colors.muted,
    textAlign:  'right',
  },
  scoreLabel: {
    position:   'absolute',
    fontSize:   8,
    fontWeight: '700',
    fontFamily: font.mono,
    textAlign:  'center',
    width:      20,
  },

  // Avg line tag
  avgLineTag: {
    position:      'absolute',
    right:         0,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           3,
  },
  avgLineTagDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  avgLineTagText: {
    fontFamily: font.mono,
    fontSize:   8,
    fontWeight: '700',
  },

  threshLabel: {
    position:   'absolute',
    right:      0,
    fontFamily: font.mono,
    fontSize:   8,
    color:      colors.red,
    opacity:    0.6,
  },

  // Legend
  legend: {
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            spacing.md,
    marginTop:      spacing.xs,
    flexWrap:       'wrap',
  },
  modeLegendRow: {
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            spacing.md,
    marginTop:      spacing.xs,
    flexWrap:       'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  legendDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  legendDash: {
    width:        8,
    height:       2,
    borderRadius: 1,
  },
  legendText: {
    fontFamily: font.mono,
    fontSize:   9,
    color:      colors.muted,
  },

  // Mode dot legend
  modeDot: {
    width:          8,
    height:         8,
    borderRadius:   4,
    borderWidth:    1.5,
    alignItems:     'center',
    justifyContent: 'center',
  },
  modeDotInner: {
    width:        3,
    height:       3,
    borderRadius: 2,
  },

  // Empty
  empty: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.xl,
    alignItems:      'center',
    gap:             spacing.sm,
    marginBottom:    spacing.md,
  },
  emptyText: {
    fontFamily: font.mono,
    fontSize:   11,
    color:      colors.muted,
    textAlign:  'center',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Weekly Averages Bar Chart
// ─────────────────────────────────────────────────────────────────────────────

function WeeklyAverages({ trades }: { trades: Trade[] }) {
  const weeks = new Map<string, number[]>();

  for (const t of trades) {
    const d           = new Date(t.timestamp);
    const startOfWeek = new Date(d);
    startOfWeek.setDate(d.getDate() - d.getDay());
    const key = startOfWeek.toISOString().slice(0, 10);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(t.ruleScore);
  }

  const weekData = Array.from(weeks.entries())
    .map(([key, scores]) => ({
      label: new Date(key).toLocaleDateString('en-GB', {
        day:   'numeric',
        month: 'short',
      }),
      avg:   Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
      count: scores.length,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(-8);

  if (weekData.length < 2) return null;

  const maxAvg = Math.max(...weekData.map((w) => w.avg), 1);

  return (
    <View style={waStyles.card}>
      <View style={waStyles.header}>
        <Ionicons name="calendar" size={14} color={colors.blue} />
        <Text style={waStyles.title}>WEEKLY AVERAGES</Text>
        <Text style={waStyles.subtitle}>{weekData.length} weeks</Text>
      </View>

      {weekData.map((week, i) => {
        const barW = Math.max(4, (week.avg / maxAvg) * 100);
        const c    = scoreColor(week.avg);
        return (
          <View key={i} style={waStyles.row}>
            <Text style={waStyles.weekLabel}>{week.label}</Text>
            <View style={waStyles.barBg}>
              <View
                style={[
                  waStyles.barFill,
                  { width: `${barW}%`, backgroundColor: c + '88' },
                ]}
              />
              <View
                style={[
                  waStyles.barFillFront,
                  { width: `${barW}%`, backgroundColor: c },
                ]}
              />
            </View>
            <Text style={[waStyles.avgText, { color: c }]}>{week.avg}%</Text>
            <Text style={waStyles.countText}>{week.count}t</Text>
          </View>
        );
      })}
    </View>
  );
}

const waStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginBottom:  spacing.md,
  },
  title: {
    fontFamily:    font.mono,
    fontSize:      9,
    color:         colors.muted,
    letterSpacing: 1.5,
    flex:          1,
  },
  subtitle: {
    fontFamily: font.mono,
    fontSize:   9,
    color:      colors.muted,
    opacity:    0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginBottom:  8,
  },
  weekLabel: {
    fontFamily: font.mono,
    fontSize:   9,
    color:      colors.muted,
    width:      48,
  },
  barBg: {
    flex:            1,
    height:          10,
    backgroundColor: colors.surface2,
    borderRadius:    5,
    overflow:        'hidden',
    position:        'relative',
  },
  barFill: {
    position:     'absolute',
    height:       10,
    borderRadius: 5,
    opacity:      0.3,
  },
  barFillFront: {
    position:     'absolute',
    height:       6,
    borderRadius: 5,
    top:          2,
    left:         0,
    opacity:      1,
  },
  avgText: {
    fontFamily: font.mono,
    fontSize:   11,
    fontWeight: '800',
    width:      36,
    textAlign:  'right',
  },
  countText: {
    fontFamily: font.mono,
    fontSize:   9,
    color:      colors.muted,
    width:      20,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule Compliance Breakdown — World-Class Mode-Aware Engine
// ─────────────────────────────────────────────────────────────────────────────

function RuleCompliance({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return null;

  // ── Mode counts for header ───────────────────────────────────────────────
  const proCount  = trades.filter((t) => t.mode === 'pro').length;
  const fullCount = trades.filter((t) => t.mode === 'full').length;
  const legacyCount = trades.filter((t) => !t.mode).length;

  // ── Build mode-aware rule stats ──────────────────────────────────────────
  // Get all unique rules across both modes
  const allUniqueRules = getAllUniqueRules();

  const ruleStats = allUniqueRules.map((rule) => {
    // Only count trades where this rule was actually available
    const applicableTrades = trades.filter((t) => {
      // Legacy trades (no mode field) — treat as full
      const tradeMode = t.mode ?? 'full';
      const applicable = getRulesForMode(tradeMode);
      return applicable.includes(rule);
    });

    const followed        = applicableTrades.filter((t) => t.rules.includes(rule)).length;
    const applicableCount = applicableTrades.length;
    const pct             = applicableCount > 0
      ? Math.round((followed / applicableCount) * 100)
      : 0;

    // Is this rule in pro mode?
    const isProRule = PRO_RULES.includes(rule);

    return {
      rule,
      followed,
      applicableCount,
      pct,
      isProRule,
    };
  })
  // Only show rules that have at least 1 applicable trade
  .filter((r) => r.applicableCount > 0)
  // Sort best to worst
  .sort((a, b) => b.pct - a.pct);

  // ── Top 5 most followed ──────────────────────────────────────────────────
  const topRules    = ruleStats.slice(0, 5);

  // ── Bottom 5 most skipped ────────────────────────────────────────────────
  const bottomRules = [...ruleStats].sort((a, b) => a.pct - b.pct).slice(0, 5);

  return (
    <View style={rcStyles.card}>

      {/* Header */}
      <View style={rcStyles.header}>
        <Ionicons name="list-circle" size={14} color={colors.purple} />
        <Text style={rcStyles.title}>RULE COMPLIANCE BREAKDOWN</Text>
      </View>

      {/* Mode summary badges */}
      <View style={rcStyles.modeBadgeRow}>
        {proCount > 0 && (
          <View style={[rcStyles.modeBadge, { borderColor: colors.green + '44', backgroundColor: colors.green + '10' }]}>
            <Ionicons name="flash" size={10} color={colors.green} />
            <Text style={[rcStyles.modeBadgeText, { color: colors.green }]}>
              {proCount} Pro trades
            </Text>
          </View>
        )}
        {fullCount > 0 && (
          <View style={[rcStyles.modeBadge, { borderColor: colors.blue + '44', backgroundColor: colors.blue + '10' }]}>
            <Ionicons name="list" size={10} color={colors.blue} />
            <Text style={[rcStyles.modeBadgeText, { color: colors.blue }]}>
              {fullCount} Full trades
            </Text>
          </View>
        )}
        {legacyCount > 0 && (
          <View style={[rcStyles.modeBadge, { borderColor: colors.muted + '44', backgroundColor: colors.surface2 }]}>
            <Ionicons name="time-outline" size={10} color={colors.muted} />
            <Text style={[rcStyles.modeBadgeText, { color: colors.muted }]}>
              {legacyCount} Legacy
            </Text>
          </View>
        )}
      </View>

      {/* Info note */}
      <View style={rcStyles.infoRow}>
        <Ionicons name="information-circle-outline" size={12} color={colors.muted} />
        <Text style={rcStyles.infoText}>
          Each rule is scored only against trades where it was applicable
        </Text>
      </View>

      {/* Most followed */}
      <Text style={rcStyles.subLabel}>✓ MOST FOLLOWED</Text>
      {topRules.map((r, i) => (
        <RuleRow key={i} rule={r} color={colors.green} />
      ))}

      <View style={rcStyles.separator} />

      {/* Most skipped */}
      <Text style={rcStyles.subLabel}>✗ MOST SKIPPED</Text>
      {bottomRules.map((r, i) => (
        <RuleRow key={i} rule={r} color={colors.red} />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule Row — single rule compliance row
// ─────────────────────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  color,
}: {
  rule: {
    rule:            string;
    followed:        number;
    applicableCount: number;
    pct:             number;
    isProRule:       boolean;
  };
  color: string;
}) {
  const barColor = scoreColor(rule.pct);

  return (
    <View style={rcStyles.row}>
      {/* Rule name + sample count */}
      <View style={rcStyles.ruleInfo}>
        <View style={rcStyles.ruleLabelRow}>
          {rule.isProRule && (
            <View style={rcStyles.proTag}>
              <Text style={rcStyles.proTagText}>⚡</Text>
            </View>
          )}
          <Text style={rcStyles.ruleText} numberOfLines={1}>
            {rule.rule}
          </Text>
        </View>
        <Text style={rcStyles.sampleText}>
          {rule.followed}/{rule.applicableCount} trades
        </Text>
      </View>

      {/* Bar */}
      <View style={rcStyles.barBg}>
        <View
          style={[
            rcStyles.barFill,
            { width: `${rule.pct}%`, backgroundColor: barColor },
          ]}
        />
      </View>

      {/* Percentage */}
      <Text style={[rcStyles.pct, { color: barColor }]}>
        {rule.pct}%
      </Text>
    </View>
  );
}

const rcStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginBottom:  spacing.sm,
  },
  title: {
    fontFamily:    font.mono,
    fontSize:      9,
    color:         colors.muted,
    letterSpacing: 1.5,
  },

  // Mode badges
  modeBadgeRow: {
    flexDirection:  'row',
    gap:            spacing.xs,
    marginBottom:   spacing.sm,
    flexWrap:       'wrap',
  },
  modeBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    borderWidth:       1,
    borderRadius:      radius.pill,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  modeBadgeText: {
    fontFamily:    font.mono,
    fontSize:      9,
    fontWeight:    '700',
    letterSpacing: 0.5,
  },

  // Info note
  infoRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    backgroundColor: colors.surface2,
    borderRadius:    radius.sm,
    padding:         spacing.sm,
    marginBottom:    spacing.md,
  },
  infoText: {
    flex:       1,
    fontFamily: font.mono,
    fontSize:   9,
    color:      colors.muted,
    opacity:    0.8,
    lineHeight: 14,
  },

  subLabel: {
    fontFamily:    font.mono,
    fontSize:      9,
    color:         colors.muted,
    letterSpacing: 1,
    marginBottom:  spacing.sm,
  },

  // Rule row
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginBottom:  8,
  },
  ruleInfo: { width: 130 },
  ruleLabelRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           3,
    marginBottom:  2,
  },
  proTag: {
    flexShrink: 0,
  },
  proTagText: {
    fontSize: 9,
  },
  ruleText: {
    fontFamily: font.mono,
    fontSize:   9,
    color:      colors.muted,
    flex:       1,
  },
  sampleText: {
    fontFamily: font.mono,
    fontSize:   8,
    color:      colors.muted,
    opacity:    0.55,
  },
  barBg: {
    flex:            1,
    height:          6,
    backgroundColor: colors.surface2,
    borderRadius:    3,
    overflow:        'hidden',
  },
  barFill: {
    height:       6,
    borderRadius: 3,
  },
  pct: {
    fontFamily: font.mono,
    fontSize:   10,
    fontWeight: '800',
    width:      32,
    textAlign:  'right',
  },
  separator: {
    height:          0.5,
    backgroundColor: colors.border,
    marginVertical:  spacing.md,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Insights Card
// ─────────────────────────────────────────────────────────────────────────────

function InsightsCard({
  trades,
  avgScore,
  trend,
}: {
  trades:   Trade[];
  avgScore: number;
  trend:    number;
}) {
  if (trades.length < 3) return null;

  let bestStreak = 0;
  let curStreak  = 0;
  for (const t of [...trades].reverse()) {
    if (t.ruleScore >= 80) {
      curStreak++;
      if (curStreak > bestStreak) bestStreak = curStreak;
    } else {
      curStreak = 0;
    }
  }

  // ── Mode-aware rule stats for insights ──────────────────────────────────
  const allUniqueRules = getAllUniqueRules();

  const ruleCounts = allUniqueRules.map((rule) => {
    const applicableTrades = trades.filter((t) => {
      const tradeMode  = t.mode ?? 'full';
      const applicable = getRulesForMode(tradeMode);
      return applicable.includes(rule);
    });
    const pct = applicableTrades.length > 0
      ? Math.round(
          (applicableTrades.filter((t) => t.rules.includes(rule)).length /
            applicableTrades.length) * 100
        )
      : 0;
    return { rule, pct, applicableCount: applicableTrades.length };
  }).filter((r) => r.applicableCount > 0);

  const mostSkipped  = [...ruleCounts].sort((a, b) => a.pct - b.pct)[0];
  const mostFollowed = [...ruleCounts].sort((a, b) => b.pct - a.pct)[0];

  const highDisc       = trades.filter((t) => t.ruleScore >= 80);
  const highDiscWins   = highDisc.filter((t) => t.result === 'win').length;
  const highDiscClosed = highDisc.filter(
    (t) => t.result === 'win' || t.result === 'loss'
  ).length;
  const highDiscWR =
    highDiscClosed > 0 ? Math.round((highDiscWins / highDiscClosed) * 100) : 0;

  const lowDisc       = trades.filter((t) => t.ruleScore < 60);
  const lowDiscWins   = lowDisc.filter((t) => t.result === 'win').length;
  const lowDiscClosed = lowDisc.filter(
    (t) => t.result === 'win' || t.result === 'loss'
  ).length;
  const lowDiscWR =
    lowDiscClosed > 0 ? Math.round((lowDiscWins / lowDiscClosed) * 100) : 0;

  const insights: { icon: string; color: string; text: string }[] = [];

  if (trend > 5) {
    insights.push({
      icon:  'trending-up',
      color: colors.green,
      text:  `Your discipline improved ${Math.round(trend)}% over your last ${Math.min(20, trades.length)} trades. Keep it up!`,
    });
  } else if (trend < -5) {
    insights.push({
      icon:  'trending-down',
      color: colors.red,
      text:  `Your discipline dropped ${Math.abs(Math.round(trend))}% recently. Review your checklist before each trade.`,
    });
  } else {
    insights.push({
      icon:  'remove-circle',
      color: colors.amber,
      text:  `Your discipline has been consistent. Focus on improving your weakest rules.`,
    });
  }

  if (highDiscClosed >= 3 && lowDiscClosed >= 3) {
    const diff = highDiscWR - lowDiscWR;
    if (diff > 0) {
      insights.push({
        icon:  'shield-checkmark',
        color: colors.green,
        text:  `When discipline is 80%+, your win rate is ${highDiscWR}% vs ${lowDiscWR}% when below 60%. Discipline pays!`,
      });
    }
  }

  if (bestStreak >= 3) {
    insights.push({
      icon:  'flame',
      color: colors.amber,
      text:  `Your best high-discipline streak is ${bestStreak} consecutive trades at 80%+.`,
    });
  }

  if (mostSkipped && mostSkipped.pct < 70) {
    insights.push({
      icon:  'alert-circle',
      color: colors.red,
      text:  `Most skipped rule: "${mostSkipped.rule}" — only ${mostSkipped.pct}% compliance.`,
    });
  }

  if (mostFollowed && mostFollowed.pct >= 90) {
    insights.push({
      icon:  'checkmark-circle',
      color: colors.green,
      text:  `Strongest rule: "${mostFollowed.rule}" — ${mostFollowed.pct}% compliance.`,
    });
  }

  return (
    <View style={insStyles.card}>
      <View style={insStyles.header}>
        <Ionicons name="bulb" size={14} color={colors.amber} />
        <Text style={insStyles.title}>INSIGHTS & RECOMMENDATIONS</Text>
      </View>
      {insights.map((insight, i) => (
        <View key={i} style={insStyles.row}>
          <View style={[insStyles.iconBg, { backgroundColor: insight.color + '18' }]}>
            <Ionicons name={insight.icon as any} size={14} color={insight.color} />
          </View>
          <Text style={insStyles.text}>{insight.text}</Text>
        </View>
      ))}
    </View>
  );
}

const insStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginBottom:  spacing.md,
  },
  title: {
    fontFamily:    font.mono,
    fontSize:      9,
    color:         colors.muted,
    letterSpacing: 1.5,
  },
  row: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               spacing.sm,
    marginBottom:      spacing.sm,
    paddingBottom:     spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  iconBg: {
    width:          28,
    height:         28,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  text: {
    flex:       1,
    fontFamily: font.mono,
    fontSize:   11,
    color:      colors.text,
    lineHeight: 17,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Score Distribution
// ─────────────────────────────────────────────────────────────────────────────

function ScoreDistribution({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return null;

  const buckets = [
    { label: '0-20%',   min: 0,  max: 20,  color: colors.red           },
    { label: '20-40%',  min: 20, max: 40,  color: colors.red + 'aa'    },
    { label: '40-60%',  min: 40, max: 60,  color: colors.amber          },
    { label: '60-80%',  min: 60, max: 80,  color: colors.green + 'aa'  },
    { label: '80-100%', min: 80, max: 101, color: colors.green          },
  ];

  const counts = buckets.map((b) => ({
    ...b,
    count: trades.filter(
      (t) => t.ruleScore >= b.min && t.ruleScore < b.max
    ).length,
  }));

  const maxCount = Math.max(...counts.map((c) => c.count), 1);

  return (
    <View style={sdStyles.card}>
      <View style={sdStyles.header}>
        <Ionicons name="stats-chart" size={14} color={colors.purple} />
        <Text style={sdStyles.title}>SCORE DISTRIBUTION</Text>
      </View>

      <View style={sdStyles.chartRow}>
        {counts.map((bucket, i) => {
          const barH = Math.max(4, (bucket.count / maxCount) * 100);
          return (
            <View key={i} style={sdStyles.barCol}>
              <Text style={sdStyles.countLabel}>{bucket.count}</Text>
              <View style={sdStyles.barBg}>
                <View
                  style={[
                    sdStyles.barFill,
                    {
                      height:          `${barH}%`,
                      backgroundColor: bucket.color,
                    },
                  ]}
                />
              </View>
              <Text style={sdStyles.bucketLabel}>{bucket.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const sdStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginBottom:  spacing.md,
  },
  title: {
    fontFamily:    font.mono,
    fontSize:      9,
    color:         colors.muted,
    letterSpacing: 1.5,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    height:        120,
    gap:           spacing.xs,
  },
  barCol: {
    flex:           1,
    alignItems:     'center',
    height:         '100%',
    justifyContent: 'flex-end',
  },
  countLabel: {
    fontFamily:   font.mono,
    fontSize:     10,
    color:        colors.text,
    fontWeight:   '800',
    marginBottom: 4,
  },
  barBg: {
    width:           '80%',
    flex:            1,
    backgroundColor: colors.surface2,
    borderRadius:    4,
    overflow:        'hidden',
    justifyContent:  'flex-end',
  },
  barFill: {
    width:        '100%',
    borderRadius: 4,
    minHeight:    4,
  },
  bucketLabel: {
    fontFamily: font.mono,
    fontSize:   7,
    color:      colors.muted,
    marginTop:  4,
    textAlign:  'center',
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// Main Screen
// ══════════════════════════════════════════════════════════════════════════════

export default function DisciplineTrendScreen() {
  const { accent } = useAppContext();
  const router     = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    loadTrades().then(setTrades);
  }, []);

  const last20 = [...trades].slice(0, 20).reverse();

  const avgScore =
    trades.length > 0
      ? Math.round(
          trades.reduce((s, t) => s + t.ruleScore, 0) / trades.length
        )
      : 0;

  const trend =
    last20.length >= 2
      ? last20[last20.length - 1].ruleScore - last20[0].ruleScore
      : 0;

  const thisMonthTrades = trades.filter((t) => {
    const d   = new Date(t.timestamp);
    const now = new Date();
    return (
      d.getMonth()    === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  });

  const monthAvg =
    thisMonthTrades.length > 0
      ? Math.round(
          thisMonthTrades.reduce((s, t) => s + t.ruleScore, 0) /
            thisMonthTrades.length
        )
      : 0;

  const highDiscCount = trades.filter((t) => t.ruleScore >= 80).length;
  const highDiscPct =
    trades.length > 0
      ? Math.round((highDiscCount / trades.length) * 100)
      : 0;

  const sc = scoreColor(avgScore);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Discipline Trend' }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={[styles.headerIcon, { backgroundColor: sc + '18' }]}>
            <Ionicons name="shield-checkmark" size={28} color={sc} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Discipline Trend</Text>
            <Text style={styles.headerSub}>
              Your psychology performance over time
            </Text>
          </View>
          <View style={styles.headerScore}>
            <Text style={[styles.headerScoreNum, { color: sc }]}>
              {avgScore}%
            </Text>
            <Text style={styles.headerScoreLabel}>
              {scoreLabel(avgScore)}
            </Text>
          </View>
        </View>

        {/* Overview stats */}
        <View style={styles.overviewRow}>
          <OverviewStat
            icon="analytics"
            label="ALL TIME AVG"
            value={`${avgScore}%`}
            color={sc}
            sub={scoreLabel(avgScore)}
          />
          <View style={{ width: spacing.xs }} />
          <OverviewStat
            icon="calendar"
            label="THIS MONTH"
            value={thisMonthTrades.length > 0 ? `${monthAvg}%` : 'N/A'}
            color={scoreColor(monthAvg)}
            sub={`${thisMonthTrades.length} trades`}
          />
          <View style={{ width: spacing.xs }} />
          <OverviewStat
            icon="star"
            label="80%+ TRADES"
            value={`${highDiscPct}%`}
            color={colors.green}
            sub={`${highDiscCount} trades`}
          />
        </View>

        {/* Trend line chart */}
        <TrendLineChart trades={trades} accent={accent} />

        {/* Score distribution */}
        <ScoreDistribution trades={trades} />

        {/* Weekly averages */}
        <WeeklyAverages trades={trades} />

        {/* Insights */}
        <InsightsCard trades={trades} avgScore={avgScore} trend={trend} />

        {/* Rule compliance */}
        <RuleCompliance trades={trades} />

        {/* Empty state */}
        {trades.length === 0 && (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyEmoji}>🛡️</Text>
            <Text style={styles.emptyTitle}>No data yet</Text>
            <Text style={styles.emptyText}>
              Log your first trade with the discipline checklist to start
              tracking your psychology score.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/log')}
              style={[styles.emptyBtn, { backgroundColor: accent }]}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyBtnText}>Log First Trade</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.bg },
  scroll:  { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 60 },

  headerCard: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.md,
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.md,
  },
  headerIcon: {
    width:          56,
    height:         56,
    borderRadius:   16,
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerText:  { flex: 1 },
  headerTitle: {
    color:        colors.text,
    fontSize:     18,
    fontWeight:   '800',
    marginBottom: 4,
  },
  headerSub: {
    fontFamily: font.mono,
    fontSize:   10,
    color:      colors.muted,
    lineHeight: 16,
  },
  headerScore:      { alignItems: 'flex-end' },
  headerScoreNum: {
    fontFamily: font.mono,
    fontSize:   28,
    fontWeight: '800',
  },
  headerScoreLabel: {
    fontFamily:    font.mono,
    fontSize:      9,
    color:         colors.muted,
    letterSpacing: 0.5,
  },

  overviewRow: {
    flexDirection: 'row',
    marginBottom:  spacing.md,
  },

  emptyBlock: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.xl,
    alignItems:      'center',
  },
  emptyEmoji:  { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: {
    color:        colors.text,
    fontSize:     16,
    fontWeight:   '700',
    marginBottom: 8,
  },
  emptyText: {
    fontFamily:   font.mono,
    fontSize:     11,
    color:        colors.muted,
    textAlign:    'center',
    lineHeight:   18,
    marginBottom: spacing.lg,
  },
  emptyBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical:   12,
    borderRadius:      radius.lg,
  },
  emptyBtnText: {
    fontFamily: font.mono,
    fontSize:   13,
    fontWeight: '700',
    color:      colors.bg,
  },
});