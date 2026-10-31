import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Animated,
  StatusBar,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Circle, Line } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { format } from 'date-fns'; // Added for production-safe date rendering
import { 
  loadTrades, calcStats, exportTradesAsFile, Trade, 
  groupTradesByMonth, getMonthKey 
} from '../store/trades';
import { colors, font, spacing, radius } from '../theme';
import { TradeCard } from '../components/TradeCard';
import { Toast } from '../components/UI';
import { ViolationWidget } from '../components/ViolationWidget';
import { getTopViolations, RuleViolation } from '../store/interventionEngine';

const SCREEN_W         = Dimensions.get('window').width;
const LAST_STREAK_KEY  = '@last_celebrated_streak';
const LAST_INSIGHT_KEY = '@last_insight_index';

// ── Currency Reference Map ──────────────────────────────────────────────────
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

// ── Date Helpers for Calendar (Production Safe) ──────────────────────────────
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

// ── Greeting ─────────────────────────────────────────────────────────────────
function getGreeting(): { greeting: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 5)  return { greeting: 'Burning the midnight oil', emoji: '🌙' };
  if (h < 12) return { greeting: 'Good morning',              emoji: '☀️' };
  if (h < 17) return { greeting: 'Good afternoon',            emoji: '👋' };
  if (h < 21) return { greeting: 'Good evening',              emoji: '🌆' };
  return        { greeting: 'Late session',                   emoji: '🌙' };
}

// ── Gradient Text ─────────────────────────────────────────────────────────────
function GradientText({ text, style }: { text: string; style?: any }) {
  return (
    <MaskedView maskElement={<Text style={style}>{text}</Text>}>
      <LinearGradient
        colors={['#ff6a00', '#ff9d3d', '#ffd166']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text style={[style, { opacity: 0 }]}>{text}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

// ── Staggered Entrance Wrapper ───────────────────────────────────────────────
function FadeInUp({ children, delay = 0, active = true }: { children: React.ReactNode; delay?: number; active?: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    if (!active) return;
    opacity.setValue(0);
    translateY.setValue(14);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 380, delay, useNativeDriver: true }),
    ]).start();
  }, [active]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ── Skeleton Loader ───────────────────────────────────────────────────────────
function Shimmer({ style }: { style: any }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return <Animated.View style={[style, { backgroundColor: colors.surface2, opacity }]} />;
}

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
  row:   { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md },
  line:  { flex: 1, height: 0.5, backgroundColor: colors.border },
  label: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginHorizontal: spacing.sm },
});

// ── Hero Stat ─────────────────────────────────────────────────────────────────
function HeroStat({
  icon, label, value, color, sub, empty,
}: {
  icon:  string;
  label: string;
  value: string | number;
  color: string;
  sub?:  string;
  empty?: boolean;
}) {
  return (
    <View
      style={heroStyles.card}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${empty ? 'no data yet' : value}${sub ? `, ${sub}` : ''}`}
    >
      <View style={heroStyles.topRow}>
        <View style={[heroStyles.iconBg, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon as any} size={16} color={color} />
        </View>
        <Text style={heroStyles.label}>{label}</Text>
      </View>
      <Text style={[heroStyles.value, { color: empty ? colors.muted : color }]}>
        {empty ? '—' : value}
      </Text>
      {sub && <Text style={heroStyles.sub}>{sub}</Text>}
    </View>
  );
}
const heroStyles = StyleSheet.create({
  card: {
    flex:            1,
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    justifyContent:  'space-between',
    minHeight:       120,
  },
  topRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  iconBg:  { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label:   { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1.5, flex: 1 },
  value:   { fontFamily: font.mono, fontSize: 24, fontWeight: '800', letterSpacing: 0.5 },
  sub:     { fontFamily: font.mono, fontSize: 9, color: colors.muted, marginTop: 2 },
});

// ── Discipline Progress ───────────────────────────────────────────────────────
function DisciplineProgress({ score, color }: { score: number; color: string }) {
  const segments = 10;
  const filled   = Math.round((score / 100) * segments);
  return (
    <View style={discStyles.container}>
      <Text style={[discStyles.score, { color }]}>{score}%</Text>
      <View style={discStyles.segmentRow}>
        {Array.from({ length: segments }).map((_, i) => (
          <View
            key={i}
            style={[
              discStyles.segment,
              { backgroundColor: i < filled ? color : colors.surface2 },
            ]}
          />
        ))}
      </View>
      <Text style={discStyles.label}>
        {score >= 80 ? 'EXCELLENT' : score >= 60 ? 'GOOD' : score >= 40 ? 'NEEDS WORK' : 'CRITICAL'}
      </Text>
    </View>
  );
}
const discStyles = StyleSheet.create({
  container:  { alignItems: 'center', gap: 8 },
  score:      { fontFamily: font.mono, fontSize: 24, fontWeight: '800', letterSpacing: 0.5 },
  segmentRow: { flexDirection: 'row', gap: 3, width: '100%' },
  segment:    { flex: 1, height: 5, borderRadius: 2 },
  label:      { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1.5 },
});

// ── Equity Curve (SVG Chart) ─────────────────────────────────────────────────
interface EquityCurveProps {
  trades: Trade[];
  isCent: boolean;
  currencySymbol: string;
  formatFn: (n: number, compact?: boolean) => string;
}

function EquityCurve({ trades, isCent, currencySymbol, formatFn }: EquityCurveProps) {
  const closed = useMemo(
    () => [...trades].filter((t) => t.result === 'win' || t.result === 'loss' || t.result === 'be').sort((a, b) => a.id - b.id),
    [trades]
  );

  const series = useMemo(() => {
    let cum = 0;
    return closed.map((t, i) => {
      cum += t.pnl;
      return { x: i, y: cum, trade: t };
    });
  }, [closed]);

  if (series.length < 2) {
    return (
      <View style={curveStyles.card}>
        <View style={curveStyles.header}>
          <View style={curveStyles.headerLeft}>
            <View style={[curveStyles.iconBg, { backgroundColor: colors.green + '18' }]}>
              <Ionicons name="trending-up" size={14} color={colors.green} />
            </View>
            <Text style={curveStyles.title}>EQUITY CURVE</Text>
          </View>
        </View>
        <View style={curveStyles.emptyBox}>
          <Ionicons name="analytics-outline" size={32} color={colors.muted} />
          <Text style={curveStyles.empty}>
            {series.length === 0 ? 'Close 2+ trades to see your equity curve' : 'One more closed trade to plot the line'}
          </Text>
        </View>
      </View>
    );
  }

  const W       = SCREEN_W - spacing.lg * 2 - spacing.md * 2;
  const H       = 180;
  const padding = 12;
  const minY    = Math.min(...series.map((p) => p.y), 0);
  const maxY    = Math.max(...series.map((p) => p.y), 0);
  const rangeY  = Math.max(maxY - minY, 1);

  const points = series.map((p, i) => ({
    x: padding + (i / (series.length - 1)) * (W - padding * 2),
    y: padding + (1 - (p.y - minY) / rangeY) * (H - padding * 2),
    cumPnl: p.y,
  }));

  const buildPath = (pts: typeof points) => {
    if (pts.length === 0) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1], curr = pts[i];
      const cx1  = prev.x + (curr.x - prev.x) / 2, cy1  = prev.y;
      const cx2  = prev.x + (curr.x - prev.x) / 2, cy2  = curr.y;
      d += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${curr.x} ${curr.y}`;
    }
    return d;
  };

  const linePath = buildPath(points);
  const fillPath = `${linePath} L ${points[points.length - 1].x} ${H - padding} L ${points[0].x} ${H - padding} Z`;
  const zeroY    = padding + (1 - (0 - minY) / rangeY) * (H - padding * 2);
  const final    = series[series.length - 1].y;
  const isPos    = final >= 0;
  const lineColor = isPos ? colors.green : colors.red;

  return (
    <View style={curveStyles.card}>
      <View style={curveStyles.header}>
        <View style={curveStyles.headerLeft}>
          <View style={[curveStyles.iconBg, { backgroundColor: lineColor + '18' }]}>
            <Ionicons name={isPos ? 'trending-up' : 'trending-down'} size={14} color={lineColor} />
          </View>
          <Text style={curveStyles.title}>EQUITY CURVE</Text>
        </View>
        <View style={curveStyles.totalBadge}>
          <Text style={[curveStyles.totalText, { color: lineColor }]}>
            {formatFn(final, true)}
          </Text>
        </View>
      </View>
      <Svg width={W} height={H}>
        <Defs>
          <SvgGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lineColor} stopOpacity="0.25" />
            <Stop offset="1" stopColor={lineColor} stopOpacity="0.0" />
          </SvgGradient>
        </Defs>
        <Line x1={padding} x2={W - padding} y1={zeroY} y2={zeroY} stroke={colors.border2} strokeWidth={0.5} strokeDasharray="3,3" />
        <Path d={fillPath} fill="url(#curveFill)" />
        <Path d={linePath} stroke={lineColor} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={5} fill={lineColor} stroke={colors.bg} strokeWidth={2} />
      </Svg>
      <View style={curveStyles.footer}>
        <View style={curveStyles.legendItem}>
          <View style={[curveStyles.legendDot, { backgroundColor: lineColor }]} />
          <Text style={curveStyles.legendText}>Cumulative P&L</Text>
        </View>
        <Text style={curveStyles.legendRight}>{series.length} closed trades</Text>
      </View>
    </View>
  );
}
const curveStyles = StyleSheet.create({
  card:        { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBg:      { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:       { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5 },
  totalBadge:  { backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  totalText:   { fontFamily: font.mono, fontSize: 11, fontWeight: '700' },
  footer:      { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.md },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:   { width: 6, height: 6, borderRadius: 3 },
  legendText:  { fontFamily: font.mono, fontSize: 9, color: colors.muted },
  legendRight: { fontFamily: font.mono, fontSize: 9, color: colors.muted, marginLeft: 'auto' },
  emptyBox:    { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.sm },
  empty:       { fontFamily: font.mono, fontSize: 11, color: colors.muted, textAlign: 'center', paddingHorizontal: spacing.lg },
});

// ── Date Picker Modal (for selecting a single day) ────────────────────────────
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
      <TouchableOpacity style={pickerStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={pickerStyles.sheet} onPress={() => {}}>
          <View style={pickerStyles.header}>
            <TouchableOpacity onPress={goPrevMonth} style={pickerStyles.navBtn}>
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </TouchableOpacity>
            <Text style={pickerStyles.monthText}>{monthName}</Text>
            <TouchableOpacity
              onPress={goNextMonth}
              style={[pickerStyles.navBtn, !canGoNext && { opacity: 0.3 }]}
              disabled={!canGoNext}
            >
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
                    pickerStyles.cell,
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
                    pickerStyles.dayNum,
                    isSelected && { color: colors.blue, fontWeight: '800' },
                    isTodayCell && !isSelected && { color: colors.green },
                  ]}>{day}</Text>
                  {dotColor && <View style={[pickerStyles.dot, { backgroundColor: dotColor }]} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={pickerStyles.legend}>
            <View style={pickerStyles.legendItem}>
              <View style={[pickerStyles.dot, { backgroundColor: colors.green }]} />
              <Text style={pickerStyles.legendText}>Win Day</Text>
              <View style={[pickerStyles.dot, { backgroundColor: colors.red, marginLeft: 8 }]} />
              <Text style={pickerStyles.legendText}>Loss Day</Text>
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
  cell:       { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 8 },
  dayNum:     { fontSize: 12, color: colors.text, fontFamily: font.mono },
  dot:        { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  legend:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 10, color: colors.muted, fontFamily: font.mono },
});

// ── Smart Insights ───────────────────────────────────────────────────────────
type Insight = { id: string; icon: string; color: string; title: string; body: string; };

function generateInsights(trades: Trade[]): Insight[] {
  const insights: Insight[] = [];
  const closed = trades.filter((t) => t.result === 'win' || t.result === 'loss');

  if (closed.length < 3) return insights;

  const sessionStats = ['London', 'New York', 'Asian', 'Overlap'].map((s) => {
    const st = closed.filter((t) => t.session === s);
    const wins = st.filter((t) => t.result === 'win').length;
    return { session: s, count: st.length, rate: st.length > 0 ? Math.round((wins / st.length) * 100) : 0 };
  }).filter((s) => s.count >= 3);

  if (sessionStats.length >= 2) {
    const best  = [...sessionStats].sort((a, b) => b.rate - a.rate)[0];
    const worst = [...sessionStats].sort((a, b) => a.rate - b.rate)[0];
    if (best.rate - worst.rate >= 20) {
      insights.push({
        id: 'session-edge', icon: 'globe', color: colors.amber,
        title: `Your edge is in ${best.session}`,
        body:  `You win ${best.rate}% of ${best.session} trades vs ${worst.rate}% in ${worst.session}. Consider focusing capital here.`,
      });
    }
  }

  return insights;
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <View style={[insightStyles.card, { borderColor: insight.color + '44' }]}>
      <View style={insightStyles.header}>
        <View style={[insightStyles.iconBg, { backgroundColor: insight.color + '22' }]}>
          <Ionicons name={insight.icon as any} size={16} color={insight.color} />
        </View>
        <Text style={[insightStyles.badge, { color: insight.color }]}>💡 SMART INSIGHT</Text>
      </View>
      <Text style={insightStyles.title}>{insight.title}</Text>
      <Text style={insightStyles.body}>{insight.body}</Text>
    </View>
  );
}
const insightStyles = StyleSheet.create({
  card:    { backgroundColor: colors.surface, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  iconBg:  { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badge:   { fontFamily: font.mono, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  title:   { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 6, lineHeight: 20 },
  body:    { fontFamily: font.mono, fontSize: 11, color: colors.muted, lineHeight: 17 },
});

// ── Components ───────────────────────────────────────────────────────────────
interface DayStateBannerProps {
  trades: Trade[];
  formatFn: (n: number, compact?: boolean) => string;
}

function DayStateBanner({ trades, formatFn }: DayStateBannerProps) {
  const today = new Date();
  const todayClosed = trades.filter((t) => new Date(t.timestamp).toDateString() === today.toDateString() && (t.result === 'win' || t.result === 'loss'));

  const wins   = todayClosed.filter((t) => t.result === 'win').length;
  const losses = todayClosed.filter((t) => t.result === 'loss').length;
  const pnl    = todayClosed.reduce((s, t) => s + t.pnl, 0);

  let state = null;
  if (todayClosed.length === 0) {
    state = { icon: 'sunny-outline', color: colors.blue, title: 'Pre-market clarity', body: 'No trades yet today. Review your plan before the first entry.' };
  } else if (losses >= 2 && pnl < 0) {
    state = { icon: 'pause-circle', color: colors.red, title: 'Cool-down recommended', body: `${losses} losses today. Step away for 30 minutes — reset before re-entering.` };
  } else if (wins >= 3 && pnl > 0) {
    state = { icon: 'flag', color: colors.green, title: `🎯 ${wins} wins · ${formatFn(pnl, true)} secured`, body: 'Strong session. Pros book gains when momentum is high. Consider stopping.' };
  } else if (wins === 1 && losses === 0) {
    state = { icon: 'trending-up', color: colors.green, title: 'First win locked in', body: 'Stay process-focused. One win doesn\'t mean force the next entry.' };
  } else if (todayClosed.length >= 1) {
    state = { icon: 'pulse', color: colors.amber, title: `${todayClosed.length} trades · ${formatFn(pnl, true)} today`, body: 'Stay with your system. Trade the plan, not the emotion.' };
  }

  if (!state) return null;

  return (
    <View style={[dayStyles.banner, { borderColor: state.color + '44', backgroundColor: state.color + '10' }]}>
      <View style={[dayStyles.iconBg, { backgroundColor: state.color + '22' }]}><Ionicons name={state.icon as any} size={18} color={state.color} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[dayStyles.title, { color: state.color }]}>{state.title}</Text>
        <Text style={dayStyles.body}>{state.body}</Text>
      </View>
    </View>
  );
}
const dayStyles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 0.5, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  iconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title:  { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  body:   { fontFamily: font.mono, fontSize: 10, color: colors.muted, lineHeight: 15 },
});

function StreakTracker({ maxWin, maxLoss, curWin }: { maxWin: number; maxLoss: number; curWin: number; }) {
  return (
    <View style={streakStyles.card}>
      <View style={streakStyles.header}>
        <View style={[streakStyles.iconBg, { backgroundColor: colors.blue + '18' }]}>
          <Ionicons name="flame" size={14} color={colors.blue} />
        </View>
        <Text style={streakStyles.title}>STREAK TRACKER</Text>
      </View>
      <View style={streakStyles.row}>
        <StreakBox label="Best Run"  value={maxWin}  color={colors.green} icon="trophy" />
        <View style={streakStyles.divider} />
        <StreakBox label="Worst Run" value={maxLoss} color={colors.red}   icon="alert-circle" />
        <View style={streakStyles.divider} />
        <StreakBox label="Active"    value={curWin}  color={colors.blue}  icon="flash" />
      </View>
    </View>
  );
}
function StreakBox({ label, value, color, icon }: { label: string; value: number; color: string; icon: string; }) {
  return (
    <View style={streakStyles.box}>
      <View style={[streakStyles.boxIconBg, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <Text style={[streakStyles.num, { color }]}>{value}</Text>
      <Text style={streakStyles.boxLabel}>{label}</Text>
    </View>
  );
}
const streakStyles = StyleSheet.create({
  card:        { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  iconBg:      { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:       { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5 },
  row:         { flexDirection: 'row', alignItems: 'center' },
  divider:     { width: 0.5, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: spacing.sm },
  box:         { flex: 1, alignItems: 'center', gap: 4 },
  boxIconBg:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  num:         { fontFamily: font.mono, fontSize: 28, fontWeight: '800', lineHeight: 32 },
  boxLabel:    { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1, textTransform: 'uppercase' },
});

interface SessionBreakdownProps {
  trades: Trade[];
  formatFn: (n: number, compact?: boolean) => string;
}

function SessionBreakdown({ trades, formatFn }: SessionBreakdownProps) {
  const sessions = ['London', 'New York', 'Asian', 'Overlap'];
  const data = sessions.map((s) => {
    const st    = trades.filter((t) => t.session === s);
    const wins  = st.filter((t) => t.result === 'win').length;
    const total = st.filter((t) => t.result === 'win' || t.result === 'loss').length;
    const pnl   = st.reduce((sum, t) => sum + t.pnl, 0);
    return { session: s, count: st.length, winRate: total > 0 ? Math.round((wins / total) * 100) : 0, pnl };
  }).filter((d) => d.count > 0);

  if (data.length === 0) return null;
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <View style={sessionStyles.card}>
      <View style={sessionStyles.header}>
        <View style={[sessionStyles.iconBg, { backgroundColor: colors.blue + '18' }]}>
          <Ionicons name="globe" size={14} color={colors.blue} />
        </View>
        <Text style={sessionStyles.title}>SESSION BREAKDOWN</Text>
      </View>
      {data.map((d) => {
        const barW     = Math.max(8, (d.count / maxCount) * 100);
        const pnlColor = d.pnl > 0 ? colors.green : d.pnl < 0 ? colors.red : colors.muted;
        return (
          <View key={d.session} style={sessionStyles.row}>
            <Text style={sessionStyles.sessionName}>{d.session}</Text>
            <View style={sessionStyles.barBg}>
              <View style={[sessionStyles.barFill, { width: `${barW}%`, backgroundColor: d.winRate >= 50 ? colors.green + '55' : colors.red + '55' }]} />
            </View>
            <Text style={sessionStyles.count}>{d.count}</Text>
            <Text style={[sessionStyles.winRate, { color: d.winRate >= 50 ? colors.green : colors.red }]}>{d.winRate}%</Text>
            <Text style={[sessionStyles.pnl, { color: pnlColor }]}>{formatFn(d.pnl, true)}</Text>
          </View>
        );
      })}
    </View>
  );
}
const sessionStyles = StyleSheet.create({
  card:        { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  iconBg:      { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:       { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5 },
  row:         { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  sessionName: { fontFamily: font.mono, fontSize: 10, color: colors.text, width: 60, fontWeight: '600' },
  barBg:       { flex: 1, height: 6, backgroundColor: colors.surface2, borderRadius: 3, overflow: 'hidden' },
  barFill:     { height: 6, borderRadius: 3 },
  count:       { fontFamily: font.mono, fontSize: 10, color: colors.muted, width: 20, textAlign: 'right' },
  winRate:     { fontFamily: font.mono, fontSize: 10, fontWeight: '700', width: 30, textAlign: 'right' },
  pnl:         { fontFamily: font.mono, fontSize: 10, fontWeight: '600', width: 55, textAlign: 'right' },
});

interface PeriodSummaryProps {
  weekPnl: number;
  weekTrades: number;
  weekWinRate: number;
  monthPnl: number;
  monthTrades: number;
  monthWinRate: number;
  formatFn: (n: number, compact?: boolean) => string;
}

function PeriodSummary({ weekPnl, weekTrades, weekWinRate, monthPnl, monthTrades, monthWinRate, formatFn }: PeriodSummaryProps) {
  const wColor = weekPnl  > 0 ? colors.green : weekPnl  < 0 ? colors.red : colors.muted;
  const mColor = monthPnl > 0 ? colors.green : monthPnl < 0 ? colors.red : colors.muted;

  return (
    <View style={periodStyles.card}>
      <View style={periodStyles.header}>
        <View style={[periodStyles.iconBg, { backgroundColor: colors.blue + '18' }]}><Ionicons name="calendar" size={14} color={colors.blue} /></View>
        <Text style={periodStyles.title}>PERIOD SUMMARY</Text>
      </View>
      <View style={periodStyles.row}>
        <View style={periodStyles.col}>
          <Text style={periodStyles.colTitle}>THIS WEEK</Text>
          {weekTrades === 0 ? (
            <Text style={[periodStyles.colPnl, { color: colors.muted }]}>—</Text>
          ) : (
            <Text style={[periodStyles.colPnl, { color: wColor }]}>
              {formatFn(weekPnl, true)}
            </Text>
          )}
          <Text style={periodStyles.colSub}>{weekTrades === 0 ? 'No trades' : `${weekTrades} trades · ${weekWinRate}% WR`}</Text>
        </View>
        <View style={periodStyles.divider} />
        <View style={periodStyles.col}>
          <Text style={periodStyles.colTitle}>THIS MONTH</Text>
          {monthTrades === 0 ? (
            <Text style={[periodStyles.colPnl, { color: colors.muted }]}>—</Text>
          ) : (
            <Text style={[periodStyles.colPnl, { color: mColor }]}>
              {formatFn(monthPnl, true)}
            </Text>
          )}
          <Text style={periodStyles.colSub}>{monthTrades === 0 ? 'No trades' : `${monthTrades} trades · ${monthWinRate}% WR`}</Text>
        </View>
      </View>
    </View>
  );
}
const periodStyles = StyleSheet.create({
  card:     { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  header:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  iconBg:   { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:    { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5 },
  row:      { flexDirection: 'row' },
  col:      { flex: 1, alignItems: 'center', padding: spacing.sm },
  colTitle: { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1.5, marginBottom: 6 },
  colPnl:   { fontFamily: font.mono, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  colSub:   { fontFamily: font.mono, fontSize: 9, color: colors.muted, textAlign: 'center' },
  divider:  { width: 0.5, backgroundColor: colors.border, alignSelf: 'stretch', marginHorizontal: spacing.sm },
});

interface BestWorstTradesProps {
  best: Trade | null;
  worst: Trade | null;
  onPress: (id: number) => void;
  formatFn: (n: number) => string;
}

function BestWorstTrades({ best, worst, onPress, formatFn }: BestWorstTradesProps) {
  if (!best && !worst) return null;
  return (
    <View style={bwStyles.card}>
      <View style={bwStyles.header}>
        <View style={[bwStyles.iconBg, { backgroundColor: colors.blue + '18' }]}><Ionicons name="podium" size={14} color={colors.blue} /></View>
        <Text style={bwStyles.title}>BEST & WORST TRADES</Text>
      </View>
      {best && (
        <TouchableOpacity onPress={() => { Haptics.selectionAsync(); onPress(best.id); }} style={[bwStyles.row, !worst && { borderBottomWidth: 0 }]} activeOpacity={0.7}>
          <View style={[bwStyles.badge, { backgroundColor: colors.green + '18', borderColor: colors.green + '55' }]}><Ionicons name="trophy" size={12} color={colors.green} /></View>
          <View style={bwStyles.info}>
            <Text style={bwStyles.pair}>{best.pair} {best.dir}</Text>
            <Text style={bwStyles.meta}>{best.dateStr} · {best.strategy}</Text>
          </View>
          <Text style={[bwStyles.pnl, { color: colors.green }]}>{formatFn(best.pnl)}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.muted} />
        </TouchableOpacity>
      )}
      {worst && (
        <TouchableOpacity onPress={() => { Haptics.selectionAsync(); onPress(worst.id); }} style={[bwStyles.row, bwStyles.lastRow]} activeOpacity={0.7}>
          <View style={[bwStyles.badge, { backgroundColor: colors.red + '18', borderColor: colors.red + '55' }]}><Ionicons name="alert-circle" size={12} color={colors.red} /></View>
          <View style={bwStyles.info}>
            <Text style={bwStyles.pair}>{worst.pair} {worst.dir}</Text>
            <Text style={bwStyles.meta}>{worst.dateStr} · {worst.strategy}</Text>
          </View>
          <Text style={[bwStyles.pnl, { color: colors.red }]}>{formatFn(worst.pnl)}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.muted} />
        </TouchableOpacity>
      )}
    </View>
  );
}
const bwStyles = StyleSheet.create({
  card:    { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  iconBg:  { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:   { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  lastRow: { borderBottomWidth: 0 },
  badge:   { width: 28, height: 28, borderRadius: 8, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  info:    { flex: 1 },
  pair:    { color: colors.text, fontSize: 13, fontWeight: '700', fontFamily: font.mono },
  meta:    { fontFamily: font.mono, fontSize: 9, color: colors.muted, marginTop: 2 },
  pnl:     { fontFamily: font.mono, fontSize: 14, fontWeight: '800' },
});

function QuickActions({ onLogTrade, onHistory, onRules }: any) {
  return (
    <View style={qaStyles.container}>
      <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onLogTrade(); }} activeOpacity={0.8} style={qaStyles.primaryBtn}>
        <View style={qaStyles.iconBg}><Ionicons name="add" size={20} color={colors.bg} /></View>
        <View style={qaStyles.textCol}>
          <Text style={qaStyles.primaryTitle}>Log New Trade</Text>
          <Text style={qaStyles.primarySub}>Record your next entry ritual</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.green} />
      </TouchableOpacity>
      <View style={qaStyles.secondaryRow}>
        <TouchableOpacity onPress={() => { Haptics.selectionAsync(); onHistory(); }} activeOpacity={0.7} style={qaStyles.secondaryBtn}>
          <Ionicons name="time-outline" size={16} color={colors.blue} />
          <Text style={[qaStyles.secondaryText, { color: colors.blue }]}>History</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { Haptics.selectionAsync(); onRules(); }} activeOpacity={0.7} style={qaStyles.secondaryBtn}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.purple} />
          <Text style={[qaStyles.secondaryText, { color: colors.purple }]}>Rules</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const qaStyles = StyleSheet.create({
  container:    { marginBottom: spacing.md },
  primaryBtn:   { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.green + '12', borderWidth: 0.5, borderColor: colors.green + '44', borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, marginBottom: spacing.sm },
  iconBg:       { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  textCol:      { flex: 1 },
  primaryTitle: { color: colors.green, fontSize: 14, fontWeight: '700' },
  primarySub:   { fontFamily: font.mono, fontSize: 10, color: colors.muted, marginTop: 2 },
  secondaryRow: { flexDirection: 'row', gap: spacing.sm },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 10 },
  secondaryText:{ fontFamily: font.mono, fontSize: 11, fontWeight: '700' },
});

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function DashboardScreen() {
  const insets                          = useSafeAreaInsets();
  const [trades, setTrades]             = useState<Trade[]>([]);
  const [violations, setViolations]     = useState<RuleViolation[]>([]);
  const [exporting, setExporting]       = useState(false);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [toastMsg, setToastMsg]         = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [insightIdx, setInsightIdx]     = useState(0);
  const [profile, setProfile]           = useState({ name: '', balance: 10000 });
  
  // Backfill Multi-Currency & Cent Settings State
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [isCentAccount, setIsCentAccount] = useState(false);

  // Date & Month Filtering State
  const [activeMonth, setActiveMonth]   = useState<string>('all');
  const [activeDate, setActiveDate]     = useState<string | null>(null); // e.g. '2026-06-18'
  const [showDatePicker, setShowDatePicker] = useState(false);

  const lastStreakRef                   = useRef<number | null>(null);
  const router                          = useRouter();
  const { greeting, emoji }             = getGreeting();

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(false);
    setTimeout(() => setToastVisible(true), 50);
  };

  const currencySymbol = useMemo(() => {
    return CURRENCY_SYMBOLS[currencyCode] || '$';
  }, [currencyCode]);

  // Unified formatting utility supporting both normal/Cent modes
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

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LAST_STREAK_KEY);
        lastStreakRef.current = stored ? parseInt(stored, 10) : 0;
        const idx = await AsyncStorage.getItem(LAST_INSIGHT_KEY);
        setInsightIdx(idx ? parseInt(idx, 10) : 0);
      } catch {
        lastStreakRef.current = 0;
      }
    })();
  }, []);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      // 1. Fetch Currency & Profile Settings
      const pName = await AsyncStorage.getItem('@user_name');
      const pBal  = await AsyncStorage.getItem('@start_balance');
      const pCur  = await AsyncStorage.getItem('@currency');
      const pCent = await AsyncStorage.getItem('@is_cent_account');

      setCurrencyCode(pCur || 'USD');
      setIsCentAccount(pCent === 'true');
      setProfile({ name: pName || '', balance: pBal ? parseFloat(pBal) : 10000 });

      // 2. Load trade history
      const t = await loadTrades();
      setTrades(t);
      setViolations(getTopViolations(t));

      const s = calcStats(t);
      const lastCelebrated = lastStreakRef.current ?? 0;
      const milestones     = [3, 5, 10, 20, 50];
      const isMilestone    = milestones.includes(s.curWin) || (s.curWin > 0 && s.curWin % 25 === 0);

      if (s.curWin > lastCelebrated && isMilestone) {
        lastStreakRef.current = s.curWin;
        await AsyncStorage.setItem(LAST_STREAK_KEY, String(s.curWin));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(`🔥 ${s.curWin} win streak! Stay disciplined.`);
      } else if (s.curWin < lastCelebrated) {
        lastStreakRef.current = s.curWin;
        await AsyncStorage.setItem(LAST_STREAK_KEY, String(s.curWin));
      }
    } catch {
      showToast('Failed to load trades');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(false); }, [fetchData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await fetchData(true);
  }, [fetchData]);

  // Month stats for chips
  const availableMonths = useMemo(() => groupTradesByMonth(trades), [trades]);

  // Calendar dates with trade info
  const tradeDatesMap = useMemo(() => {
    const map = new Map<string, { count: number; pnl: number }>();
    for (const t of trades) {
      const dateId = toDateId(new Date(t.timestamp));
      const existing = map.get(dateId) || { count: 0, pnl: 0 };
      map.set(dateId, { count: existing.count + 1, pnl: existing.pnl + (t.pnl || 0) });
    }
    return map;
  }, [trades]);

  // ── FILTER ALL TRADES BY DAY OR MONTH ──
  const filteredTrades = useMemo(() => {
    if (activeDate) {
      return trades.filter((t) => toDateId(new Date(t.timestamp)) === activeDate);
    }
    if (activeMonth !== 'all') {
      return trades.filter((t) => getMonthKey(t.timestamp) === activeMonth);
    }
    return trades;
  }, [trades, activeMonth, activeDate]);

  const stats       = useMemo(() => calcStats(filteredTrades), [filteredTrades]);
  const recent      = useMemo(() => filteredTrades.slice(0, 5), [filteredTrades]);
  const insights    = useMemo(() => generateInsights(filteredTrades), [filteredTrades]);
  const closedCount = useMemo(() => filteredTrades.filter((t) => t.result === 'win' || t.result === 'loss').length, [filteredTrades]);
  const hasTrades   = filteredTrades.length > 0;

  const startingBalance = profile.balance || 10000;
  const currentEquity   = startingBalance + stats.totalPnl;
  const roiPct          = startingBalance > 0 ? (stats.totalPnl / startingBalance) * 100 : 0;
  const roiStr          = roiPct >= 0 ? `+${roiPct.toFixed(2)}%` : `${roiPct.toFixed(2)}%`;

  const todayTrades = useMemo(() => {
    const now = new Date();
    return trades.filter((t) => new Date(t.timestamp).toDateString() === now.toDateString());
  }, [trades]);

  const pnlColor     = stats.totalPnl > 0 ? colors.green : stats.totalPnl < 0 ? colors.red : colors.muted;
  const winRateColor = stats.winRate >= 50 ? colors.green : colors.red;
  const discColor    = stats.avgDiscipline >= 80 ? colors.green : stats.avgDiscipline >= 60 ? colors.amber : colors.red;

  const currentInsight = insights.length > 0 ? insights[insightIdx % insights.length] : null;

  const rotateInsight = async () => {
    if (insights.length <= 1) return;
    Haptics.selectionAsync();
    const next = (insightIdx + 1) % insights.length;
    setInsightIdx(next);
    await AsyncStorage.setItem(LAST_INSIGHT_KEY, String(next));
  };

  const navigateToTrade = (id: number) => {
    router.push({ pathname: '/screens/TradeDetailScreen', params: { id: String(id) } });
  };

  const formatStartingBalance = (val: number) => {
    if (isCentAccount) {
      return `Started: ${val.toLocaleString('en-US')} USC`;
    }
    return `Started: ${currencySymbol}${val.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
  };

  // Status Bar Top Padding calculation for Android notches
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 0);

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} translucent={false} />
      
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: topPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
      >
        {loading && (
          <View style={styles.loadingContainer}>
            <Shimmer style={[styles.skeletonHeader, { borderRadius: radius.lg }]} />
            <View style={styles.skeletonRow}>
              <Shimmer style={[styles.skeletonCard, { borderRadius: radius.lg }]} />
              <Shimmer style={[styles.skeletonCard, { borderRadius: radius.lg }]} />
            </View>
            <Shimmer style={[styles.skeletonFull, { borderRadius: radius.lg }]} />
          </View>
        )}

        {!loading && (
          <>
            {/* ── Header ─────────────────────────────────────────────── */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.greeting}>{greeting}{profile.name ? `, ${profile.name}` : ''} {emoji}</Text>
                <GradientText text="ZERO DEVIATION" style={styles.headerTitle} />
              </View>
              {activeMonth === 'all' && !activeDate && (
                <View style={styles.headerRight}>
                  <View style={styles.todayBadge}>
                    <Text style={styles.todayNum}>{todayTrades.length}</Text>
                    <Text style={styles.todayLabel}>TODAY</Text>
                  </View>
                </View>
              )}
            </View>

            {/* ── Global Month & Calendar Selection Chips ─────────────── */}
            <View style={styles.filterBarWrap}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                contentContainerStyle={styles.monthRow}
              >
                {/* 📅 Calendar Button */}
                <TouchableOpacity
                  onPress={() => { setShowDatePicker(true); Haptics.selectionAsync(); }}
                  style={[styles.calendarPickerBtn, activeDate ? styles.calendarPickerBtnActive : null]}
                >
                  <Ionicons name="calendar-outline" size={14} color={activeDate ? colors.blue : colors.text} />
                </TouchableOpacity>

                {/* Single Day Active Chip */}
                {activeDate && (
                  <TouchableOpacity
                    onPress={() => { setActiveDate(null); Haptics.selectionAsync(); }}
                    style={styles.dayChipActive}
                  >
                    <Ionicons name="calendar" size={12} color={colors.blue} />
                    <Text style={styles.dayChipText}>{getFormattedDateStr(activeDate)}</Text>
                    <Ionicons name="close-circle" size={14} color={colors.blue} />
                  </TouchableOpacity>
                )}

                {/* All Time Chip */}
                <TouchableOpacity
                  onPress={() => { setActiveMonth('all'); setActiveDate(null); Haptics.selectionAsync(); }}
                  style={[styles.monthChip, activeMonth === 'all' && !activeDate && styles.monthChipActive]}
                >
                  <Text style={[styles.monthText, activeMonth === 'all' && !activeDate && styles.monthTextActive]}>All Time</Text>
                </TouchableOpacity>
                
                {/* Month Chips */}
                {availableMonths.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    onPress={() => { setActiveMonth(m.key); setActiveDate(null); Haptics.selectionAsync(); }}
                    style={[styles.monthChip, activeMonth === m.key && !activeDate && styles.monthChipActive]}
                  >
                    <Text style={[styles.monthText, activeMonth === m.key && !activeDate && styles.monthTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* ── Account Equity Banner ──────────────────────────────── */}
            <FadeInUp delay={40} active={!loading}>
              <View style={equityStyles.card}>
                <View style={equityStyles.left}>
                  <Text style={equityStyles.label}>
                    {activeDate 
                      ? `${getFormattedDateStr(activeDate).toUpperCase()} DAY P&L` 
                      : activeMonth === 'all' 
                      ? 'CURRENT ACCOUNT EQUITY' 
                      : `${availableMonths.find(m=>m.key===activeMonth)?.label.toUpperCase()} ENDING EQUITY`}
                  </Text>
                  <Text style={equityStyles.equityValue}>
                    {isCentAccount 
                      ? `${Math.round(currentEquity).toLocaleString('en-US')} USC`
                      : `${currencySymbol}${currentEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    }
                  </Text>
                </View>
                <View style={equityStyles.right}>
                  <View style={[equityStyles.pnlBadge, { backgroundColor: pnlColor + '18', borderColor: pnlColor + '44' }]}>
                    <Ionicons name={stats.totalPnl >= 0 ? "trending-up" : "trending-down"} size={12} color={pnlColor} />
                    <Text style={[equityStyles.pnlText, { color: pnlColor }]}>
                      {formatCurrencyValue(stats.totalPnl)} ({roiStr})
                    </Text>
                  </View>
                  <Text style={equityStyles.startSub}>{formatStartingBalance(startingBalance)}</Text>
                </View>
              </View>
            </FadeInUp>

            {/* Cent Account Warning Banner */}
            {isCentAccount && (
              <FadeInUp delay={60} active={!loading}>
                <View style={styles.centTrackerBanner}>
                  <Ionicons name="sparkles" size={13} color={colors.amber} />
                  <Text style={styles.centTrackerBannerText}>
                    CENT ACCOUNT TRACKING ACTIVE (USC UNITS ENABLED)
                  </Text>
                </View>
              </FadeInUp>
            )}

            {/* ── Day State Banner (Hidden if filtering by past date or month) ── */}
            {activeMonth === 'all' && !activeDate && (
              <FadeInUp delay={80} active={!loading}>
                <DayStateBanner trades={filteredTrades} formatFn={formatCurrencyValue} />
              </FadeInUp>
            )}

            {/* Smart Insight */}
            {currentInsight && (
              <FadeInUp delay={120} active={!loading}>
                <TouchableOpacity activeOpacity={0.9} onPress={rotateInsight}>
                  <InsightCard key={currentInsight.id} insight={currentInsight} />
                  {insights.length > 1 && (
                    <Text style={styles.insightHint}>
                      {insightIdx + 1} / {insights.length} · tap to cycle
                    </Text>
                  )}
                </TouchableOpacity>
              </FadeInUp>
            )}

            {/* Quick Actions */}
            <FadeInUp delay={160} active={!loading}>
              <QuickActions
                onLogTrade={() => {
                  if (activeDate) {
                    router.push({ pathname: '/(tabs)/log', params: { date: activeDate } });
                  } else {
                    router.push('/(tabs)/log');
                  }
                }}
                onHistory={() => router.push('/(tabs)/history')}
                onRules={() => router.push('/screens/DisciplineTrendScreen')}
              />
            </FadeInUp>

            {/* Hero Stats */}
            <FadeInUp delay={200} active={!loading}>
              <View style={styles.heroGrid}>
                <View style={styles.heroRow}>
                  <HeroStat
                    icon="layers" label="TOTAL TRADES"
                    value={filteredTrades.length} color={colors.blue}
                    sub={`${closedCount} closed`} empty={!hasTrades}
                  />
                  <View style={{ width: spacing.sm }} />
                  <HeroStat
                    icon="analytics" label="WIN RATE"
                    value={`${stats.winRate}%`} color={winRateColor}
                    sub={`${stats.wins}W / ${stats.losses}L`} empty={closedCount === 0}
                  />
                </View>
                <View style={styles.heroRow}>
                  <HeroStat
                    icon="cash" label="TOTAL P&L"
                    value={formatCurrencyValue(stats.totalPnl, true)}
                    color={pnlColor}
                    sub={closedCount === 0 ? undefined : `ROI: ${roiStr}`}
                    empty={closedCount === 0}
                  />
                  <View style={{ width: spacing.sm }} />
                  <View style={heroStyles.card}>
                    <View style={heroStyles.topRow}>
                      <View style={[heroStyles.iconBg, { backgroundColor: discColor + '18' }]}>
                        <Ionicons name="shield-checkmark" size={16} color={discColor} />
                      </View>
                      <Text style={heroStyles.label}>DISCIPLINE</Text>
                    </View>
                    {hasTrades ? (
                      <DisciplineProgress score={stats.avgDiscipline} color={discColor} />
                    ) : (
                      <Text style={[heroStyles.value, { color: colors.muted }]}>—</Text>
                    )}
                  </View>
                </View>
              </View>
            </FadeInUp>

            {/* Equity Curve */}
            <FadeInUp delay={240} active={!loading}>
              <EquityCurve 
                trades={filteredTrades} 
                isCent={isCentAccount} 
                currencySymbol={currencySymbol} 
                formatFn={formatCurrencyValue} 
              />
            </FadeInUp>

            {/* Period Summary */}
            {activeMonth === 'all' && !activeDate && (
              <FadeInUp delay={280} active={!loading}>
                <PeriodSummary
                  weekPnl={stats.thisWeekPnl}     
                  weekTrades={stats.thisWeekTrades}   
                  weekWinRate={stats.thisWeekWinRate}
                  monthPnl={stats.thisMonthPnl}   
                  monthTrades={stats.thisMonthTrades} 
                  monthWinRate={stats.thisMonthWinRate}
                  formatFn={formatCurrencyValue}
                />
              </FadeInUp>
            )}

            {/* Additional Analytics Components */}
            {hasTrades && (
              <FadeInUp delay={320} active={!loading}>
                <StreakTracker maxWin={stats.maxWin} maxLoss={stats.maxLoss} curWin={stats.curWin} />
              </FadeInUp>
            )}
            <FadeInUp delay={360} active={!loading}>
              <BestWorstTrades 
                best={stats.bestTrade} 
                worst={stats.worstTrade} 
                onPress={navigateToTrade} 
                formatFn={(n) => formatCurrencyValue(n, false)}
              />
            </FadeInUp>
            <FadeInUp delay={400} active={!loading}>
              <SessionBreakdown trades={filteredTrades} formatFn={formatCurrencyValue} />
            </FadeInUp>
            <FadeInUp delay={440} active={!loading}>
              <ViolationWidget violations={violations} onPress={() => router.push('/screens/DisciplineTrendScreen')} />
            </FadeInUp>

            {/* Recent Trades */}
            <FadeInUp delay={480} active={!loading}>
              <SectionDivider 
                label={
                  activeDate 
                    ? `${getFormattedDateStr(activeDate).toUpperCase()} TRADES`
                    : activeMonth === 'all' 
                    ? "RECENT TRADES" 
                    : `${availableMonths.find(m=>m.key===activeMonth)?.label.toUpperCase()} TRADES`
                } 
              />

              {recent.length === 0 ? (
                <View style={styles.emptyBlock}>
                  <View style={styles.emptyIconBg}>
                    <Ionicons name="document-text-outline" size={28} color={colors.muted} />
                  </View>
                  <Text style={styles.emptyTitle}>No trades found</Text>
                  <Text style={styles.emptyText}>
                    {activeDate ? `No trades were logged on ${getFormattedDateStr(activeDate)}.` : 'Your trading journey starts with a single entry.'}
                  </Text>
                </View>
              ) : (
                <>
                  {recent.map((t) => (
                    <TradeCard key={t.id} trade={t} onPress={() => { Haptics.selectionAsync(); navigateToTrade(t.id); }} />
                  ))}
                  {filteredTrades.length > 5 && (
                    <TouchableOpacity
                      onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(tabs)/history', params: { month: activeMonth }}); }}
                      style={styles.viewAllBtn}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.viewAllText}>View all {filteredTrades.length} trades</Text>
                      <Ionicons name="arrow-forward" size={14} color={colors.muted} />
                    </TouchableOpacity>
                  )}
                </>
              )}
            </FadeInUp>
          </>
        )}
      </ScrollView>

      {/* Date Picker Modal for single-day selection */}
      <DatePickerModal
        visible={showDatePicker}
        currentDateId={activeDate || todayId()}
        tradeDatesMap={tradeDatesMap}
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

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.bg },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },

  // Header
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  headerLeft:      { flex: 1 },
  greeting:        { fontFamily: font.mono, fontSize: 11, color: colors.muted, marginBottom: 4 },
  headerTitle:     { fontFamily: font.display, fontSize: 26, color: colors.text, letterSpacing: 0.8 },
  headerRight:     { alignItems: 'center' },
  todayBadge:      { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center' },
  todayNum:        { fontFamily: font.mono, fontSize: 22, fontWeight: '800', color: colors.blue },
  todayLabel:      { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1, marginTop: 2 },

  // Filter Bar Wrap
  filterBarWrap:   { marginBottom: spacing.md },
  monthRow:        { gap: spacing.sm, alignItems: 'center' },
  calendarPickerBtn: { width: 36, height: 36, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  calendarPickerBtnActive: { borderColor: colors.blue, backgroundColor: colors.blue + '22' },
  dayChipActive:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.blue + '22', borderWidth: 1, borderColor: colors.blue, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 8 },
  dayChipText:     { fontSize: 12, fontWeight: '800', color: colors.blue, fontFamily: font.mono },
  monthChip:       { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  monthChipActive: { backgroundColor: colors.blue + '22', borderColor: colors.blue },
  monthText:       { fontSize: 13, fontWeight: '600', color: colors.muted },
  monthTextActive: { color: colors.blue, fontWeight: '800' },

  insightHint: { fontFamily: font.mono, fontSize: 9, color: colors.muted, textAlign: 'center', marginTop: -spacing.sm, marginBottom: spacing.md },

  // Hero
  heroGrid: { marginBottom: spacing.md },
  heroRow:  { flexDirection: 'row', marginBottom: spacing.sm },

  // Empty
  emptyBlock:   { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' },
  emptyIconBg:  { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  emptyTitle:   { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  emptyText:    { fontFamily: font.mono, fontSize: 11, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: spacing.md },
  emptyCta:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.green + '15', borderWidth: 0.5, borderColor: colors.green + '55', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  emptyCtaText: { fontFamily: font.mono, fontSize: 11, color: colors.green, fontWeight: '700' },

  // View all
  viewAllBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md, marginTop: spacing.xs },
  viewAllText: { fontFamily: font.mono, fontSize: 11, color: colors.muted, fontWeight: '600' },

  // Skeleton
  loadingContainer: { padding: spacing.xs },
  skeletonHeader:   { height: 80, backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.sm },
  skeletonRow:      { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  skeletonCard:     { flex: 1, height: 120, backgroundColor: colors.surface, borderRadius: radius.lg },
  skeletonFull:     { height: 160, backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.sm },

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

const equityStyles = StyleSheet.create({
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  left: { flex: 1 },
  label: { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1.5, marginBottom: 4 },
  equityValue: { fontFamily: font.mono, fontSize: 20, fontWeight: '800', color: colors.text },
  right: { alignItems: 'flex-end', gap: 4 },
  pnlBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 0.5 },
  pnlText: { fontFamily: font.mono, fontSize: 10, fontWeight: '700' },
  startSub: { fontFamily: font.mono, fontSize: 9, color: colors.muted },
});