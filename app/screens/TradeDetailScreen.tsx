import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { loadTrades, deleteTrade, Trade } from '../store/trades';
import { colors, font, spacing, radius } from '../theme';
import {
  ResultBadge,
  Card,
  SectionLabel,
  RuleTag,
  GhostButton,
  Toast,
} from '../components/UI';
import { ALL_RULES, PRO_RULES, getRulesForMode } from '../store/rules';

// ── Param Row ────────────────────────────────────────────────────────────────

interface ParamRowProps {
  label:       string;
  value:       string;
  isLast?:     boolean;
  valueColor?: string;
}

function ParamRow({ label, value, isLast, valueColor }: ParamRowProps) {
  return (
    <View style={[styles.paramRow, !isLast && styles.paramRowBorder]}>
      <Text style={styles.paramLabel}>{label}</Text>
      <Text style={[styles.paramValue, valueColor ? { color: valueColor } : {}]}>
        {value}
      </Text>
    </View>
  );
}

// ── Info Block ───────────────────────────────────────────────────────────────

function InfoBlock({
  icon,
  label,
  children,
  accentColor = colors.muted,
}: {
  icon:         string;
  label:        string;
  children:     React.ReactNode;
  accentColor?: string;
}) {
  return (
    <View style={[infoStyles.card, { borderLeftColor: accentColor }]}>
      <View style={infoStyles.header}>
        <Ionicons name={icon as any} size={13} color={accentColor} />
        <Text style={[infoStyles.label, { color: accentColor }]}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

const infoStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface2,
    borderRadius:    radius.sm,
    borderLeftWidth: 3,
    padding:         spacing.md,
    marginBottom:    spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginBottom:  spacing.sm,
  },
  label: {
    fontFamily:    font.mono,
    fontSize:      9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});

// ── Mode Badge ───────────────────────────────────────────────────────────────

function ModeBadge({ mode }: { mode: 'pro' | 'full' | undefined }) {
  const isPro   = mode === 'pro';
  const color   = isPro ? colors.green : colors.blue;
  const icon    = isPro ? 'flash'      : 'list';
  const label   = isPro ? '⚡ PRO MODE — 10 rules' : '◈ FULL MODE — 25 rules';

  return (
    <View style={[
      modeStyles.badge,
      { backgroundColor: color + '10', borderColor: color + '44' },
    ]}>
      <Ionicons name={icon as any} size={11} color={color} />
      <Text style={[modeStyles.text, { color }]}>{label}</Text>
    </View>
  );
}

const modeStyles = StyleSheet.create({
  badge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    borderWidth:       1,
    borderRadius:      radius.pill,
    paddingHorizontal: 10,
    paddingVertical:   4,
    alignSelf:         'flex-start',
    marginBottom:      spacing.sm,
  },
  text: {
    fontFamily:    font.mono,
    fontSize:      9,
    fontWeight:    '700',
    letterSpacing: 0.5,
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// Main Screen
// ══════════════════════════════════════════════════════════════════════════════

export default function TradeDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const [trade, setTrade]           = useState<Trade | null>(null);
  const [toastMsg, setToastMsg]     = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [exporting, setExporting]   = useState(false);

  useEffect(() => {
    if (!id) return;
    loadTrades().then((all) => {
      const found = all.find((t) => t.id === Number(id));
      setTrade(found ?? null);
    });
  }, [id]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2300);
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = () => {
    Alert.alert(
      'Delete Trade',
      'Are you sure you want to delete this trade? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!trade) return;
            await deleteTrade(trade.id);
            showToast('Trade deleted');
            setTimeout(() => router.back(), 1500);
          },
        },
      ]
    );
  };

  // ── Export single trade ─────────────────────────────────────────────────
  const handleExportSingle = async () => {
    if (!trade) return;
    try {
      setExporting(true);
      const json = JSON.stringify(trade, null, 2);
      await Share.share({
        message: json,
        title:   `Trade ${trade.pair} ${trade.dir} - ${trade.dateStr}`,
      });
    } catch (e) {
      Alert.alert('Export Failed', 'Could not share this trade.');
    } finally {
      setExporting(false);
    }
  };

  // ── Edit ────────────────────────────────────────────────────────────────
  const handleEdit = () => {
    if (!trade) return;
    router.push({
      pathname: '/screens/EditTradeScreen',
      params:   { id: String(trade.id) },
    });
  };

  // ── Not found ───────────────────────────────────────────────────────────
  if (!trade) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Trade Detail' }} />
        <View style={styles.notFound}>
          <Ionicons name="search-outline" size={40} color={colors.muted} />
          <Text style={styles.notFoundText}>Trade not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Mode-aware rule data ─────────────────────────────────────────────────
  // Get the exact rules applicable to this trade's mode
  // Legacy trades (no mode field) default to full — 25 rules
  const tradeMode      = trade.mode ?? 'full';
  const applicableRules = getRulesForMode(tradeMode);
  const totalRules     = applicableRules.length;
  const rulesFollowed  = trade.rules.length;
  const rulesMissed    = totalRules - rulesFollowed;

  // ── Derived values ───────────────────────────────────────────────────────
  const pnlColor =
    trade.pnl > 0 ? colors.green :
    trade.pnl < 0 ? colors.red   :
    colors.muted;

  const pnlStr =
    trade.pnl > 0 ? `+$${trade.pnl.toFixed(2)}`         :
    trade.pnl < 0 ? `-$${Math.abs(trade.pnl).toFixed(2)}` :
    '$0.00';

  const scoreColor =
    trade.ruleScore >= 80 ? colors.green :
    trade.ruleScore >= 60 ? colors.amber :
    colors.red;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title:          `${trade.pair} ${trade.dir}`,
          headerBackTitle: 'Back',
          headerRight: () => (
            <TouchableOpacity
              onPress={handleExportSingle}
              style={{ marginRight: 4 }}
              disabled={exporting}
            >
              <Ionicons name="share-outline" size={22} color={colors.green} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Card ─────────────────────────────────────────────────── */}
        <Card style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroLeft}>
              <View style={styles.pairRow}>
                <Text style={styles.pairText}>{trade.pair}</Text>
                <View
                  style={[
                    styles.dirBadge,
                    {
                      backgroundColor: trade.dir === 'BUY' ? colors.green + '22' : colors.red + '22',
                      borderColor:     trade.dir === 'BUY' ? colors.green        : colors.red,
                    },
                  ]}
                >
                  <Ionicons
                    name={trade.dir === 'BUY' ? 'trending-up' : 'trending-down'}
                    size={12}
                    color={trade.dir === 'BUY' ? colors.green : colors.red}
                  />
                  <Text
                    style={[
                      styles.dirText,
                      { color: trade.dir === 'BUY' ? colors.green : colors.red },
                    ]}
                  >
                    {trade.dir}
                  </Text>
                </View>
              </View>
              <View style={styles.heroMeta}>
                <Text style={styles.metaText}>{trade.dateStr}</Text>
                <Text style={styles.metaDot}> · </Text>
                <Text style={styles.metaText}>{trade.timeStr}</Text>
                <Text style={styles.metaDot}> · </Text>
                <Text style={styles.metaText}>{trade.session}</Text>
                <Text style={styles.metaDot}> · </Text>
                <Text style={styles.metaText}>{trade.timeframe}</Text>
              </View>
            </View>
            <ResultBadge result={trade.result} />
          </View>

          <Text style={[styles.pnlLarge, { color: pnlColor }]}>{pnlStr}</Text>

          {/* Quick stats row */}
          <View style={styles.quickStats}>
            <View style={styles.quickStat}>
              <Text style={styles.quickStatLabel}>STRATEGY</Text>
              <Text style={styles.quickStatValue}>{trade.strategy}</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStat}>
              <Text style={styles.quickStatLabel}>DISCIPLINE</Text>
              <Text style={[styles.quickStatValue, { color: scoreColor }]}>
                {Math.round(trade.ruleScore)}%
              </Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStat}>
              <Text style={styles.quickStatLabel}>RULES</Text>
              {/* ✅ Now shows x/10 for pro, x/25 for full */}
              <Text style={styles.quickStatValue}>
                {rulesFollowed}/{totalRules}
              </Text>
            </View>
          </View>
        </Card>

        {/* ── Trade Parameters ──────────────────────────────────────────── */}
        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="options" size={14} color={colors.blue} />
            <SectionLabel style={styles.sectionTitle}>
              TRADE PARAMETERS
            </SectionLabel>
          </View>
          <ParamRow label="Strategy" value={trade.strategy} />
          <ParamRow label="Entry"       value={trade.entry || '—'} valueColor={colors.text} />
          <ParamRow label="Stop Loss"   value={trade.sl    || '—'} valueColor={trade.sl ? colors.red   : colors.muted} />
          <ParamRow label="Take Profit" value={trade.tp    || '—'} valueColor={trade.tp ? colors.green : colors.muted} />
          <ParamRow label="Lot Size"    value={trade.lot   || '—'} isLast />
        </Card>

        {/* ── Discipline Score ──────────────────────────────────────────── */}
        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-checkmark" size={14} color={scoreColor} />
            <SectionLabel style={styles.sectionTitle}>
              DISCIPLINE SCORE
            </SectionLabel>
          </View>

          {/* ✅ Mode badge — shows which checklist was used */}
          <ModeBadge mode={trade.mode} />

          <View style={styles.scoreRow}>
            <Text style={[styles.scoreBig, { color: scoreColor }]}>
              {Math.round(trade.ruleScore)}%
            </Text>
            <View style={styles.scoreRight}>
              {/* ✅ Correct counts — no ghost rules */}
              <Text style={styles.scoreDetail}>
                ✓ {rulesFollowed} followed
              </Text>
              <Text style={[styles.scoreDetail, { color: colors.red }]}>
                ✗ {rulesMissed} missed
              </Text>
              <Text style={[styles.scoreDetail, { color: colors.muted, fontSize: 9, opacity: 0.7 }]}>
                out of {totalRules} rules
              </Text>
            </View>
          </View>

          <View style={styles.scoreBarBg}>
            <View
              style={[
                styles.scoreBarFill,
                {
                  width:           `${Math.min(100, trade.ruleScore)}%` as any,
                  backgroundColor: scoreColor,
                },
              ]}
            />
          </View>

          {/* Score label */}
          <Text style={[styles.scoreLabel, { color: scoreColor }]}>
            {trade.ruleScore >= 80
              ? '✦ Excellent discipline'
              : trade.ruleScore >= 60
              ? '◈ Good discipline'
              : '⚠ Low discipline — review your process'}
          </Text>

          {/* ✅ Only shows rules applicable to this trade's mode */}
          <View style={styles.rulesGrid}>
            {applicableRules.map((rule, i) => (
              <RuleTag
                key={i}
                label={rule}
                done={trade.rules.includes(rule)}
              />
            ))}
          </View>
        </Card>

        {/* ── Journal Entries ───────────────────────────────────────────── */}
        {(!!trade.setup || !!trade.emotions || !!trade.mistakes || !!trade.lesson) && (
          <Card style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="journal" size={14} color={colors.purple} />
              <SectionLabel style={styles.sectionTitle}>
                TRADE JOURNAL
              </SectionLabel>
            </View>

            {!!trade.setup && (
              <InfoBlock icon="eye" label="Setup Notes" accentColor={colors.amber}>
                <Text style={styles.bodyText}>{trade.setup}</Text>
              </InfoBlock>
            )}

            {!!trade.emotions && (
              <InfoBlock icon="pulse" label="Emotions" accentColor={colors.blue}>
                <Text style={styles.bodyText}>{trade.emotions}</Text>
              </InfoBlock>
            )}

            {!!trade.mistakes && (
              <InfoBlock icon="warning" label="Mistakes" accentColor={colors.red}>
                <Text style={[styles.bodyText, { color: colors.red }]}>
                  {trade.mistakes}
                </Text>
              </InfoBlock>
            )}

            {!!trade.lesson && (
              <InfoBlock icon="bulb" label="Lesson Learned" accentColor={colors.green}>
                <Text style={[styles.bodyText, { color: colors.green }]}>
                  {trade.lesson}
                </Text>
              </InfoBlock>
            )}
          </Card>
        )}

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            onPress={handleEdit}
            style={styles.editBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="create-outline" size={18} color={colors.amber} />
            <Text style={styles.editBtnText}>Edit Trade</Text>
          </TouchableOpacity>

          <View style={{ height: spacing.sm }} />

          <TouchableOpacity
            onPress={handleExportSingle}
            style={styles.exportBtn}
            activeOpacity={0.8}
            disabled={exporting}
          >
            <Ionicons name="share-social-outline" size={18} color={colors.blue} />
            <Text style={styles.exportBtnText}>
              {exporting ? 'Exporting...' : 'Share Trade Data'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: spacing.sm }} />

          <GhostButton label="Delete Trade" onPress={handleDelete} danger />
        </View>
      </ScrollView>

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
  content: { padding: spacing.lg },

  // Not found
  notFound: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            spacing.md,
  },
  notFoundText: {
    color:      colors.muted,
    fontFamily: font.mono,
    fontSize:   14,
    marginTop:  spacing.sm,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical:   10,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.border2,
    marginTop:         spacing.sm,
  },
  backBtnText: { color: colors.text, fontFamily: font.mono, fontSize: 13 },

  // Hero card
  heroCard: { marginBottom: spacing.md },
  heroTop: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   spacing.md,
  },
  heroLeft:  { flex: 1 },
  pairRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginBottom:  6,
  },
  pairText: {
    color:        colors.text,
    fontSize:     24,
    fontWeight:   '800',
    letterSpacing: 0.5,
  },
  dirBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      radius.pill,
    borderWidth:       1,
  },
  dirText: {
    fontFamily: font.mono,
    fontSize:   11,
    fontWeight: '700',
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems:    'center',
    flexWrap:      'wrap',
  },
  metaText: { fontFamily: font.mono, fontSize: 10, color: colors.muted },
  metaDot:  { color: colors.muted, fontFamily: font.mono, fontSize: 10 },

  pnlLarge: {
    fontFamily:   font.mono,
    fontSize:     40,
    fontWeight:   '800',
    letterSpacing: 1,
    marginBottom:  spacing.md,
  },

  quickStats: {
    flexDirection:   'row',
    backgroundColor: colors.surface2,
    borderRadius:    radius.sm,
    padding:         spacing.sm,
  },
  quickStat:       { flex: 1, alignItems: 'center' },
  quickStatLabel: {
    fontFamily:    font.mono,
    fontSize:      8,
    color:         colors.muted,
    letterSpacing: 1,
    marginBottom:  3,
  },
  quickStatValue: {
    fontFamily: font.mono,
    fontSize:   12,
    fontWeight: '700',
    color:      colors.text,
  },
  quickStatDivider: {
    width:            0.5,
    backgroundColor:  colors.border,
    alignSelf:        'stretch',
    marginHorizontal: spacing.sm,
  },

  // Section
  section: { marginBottom: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginBottom:  spacing.sm,
  },
  sectionTitle: { marginBottom: 0 },

  // Params
  paramRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingVertical: 10,
  },
  paramRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  paramLabel: {
    fontFamily:    font.mono,
    fontSize:      11,
    color:         colors.muted,
    letterSpacing: 0.5,
  },
  paramValue: {
    color:      colors.text,
    fontSize:   13,
    fontWeight: '600',
    fontFamily: font.mono,
  },

  // Score
  scoreRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  spacing.sm,
    gap:           spacing.md,
  },
  scoreBig: {
    fontFamily: font.mono,
    fontSize:   40,
    fontWeight: '800',
  },
  scoreRight: { flex: 1, gap: 4 },
  scoreDetail: {
    fontFamily: font.mono,
    fontSize:   11,
    color:      colors.green,
  },
  scoreBarBg: {
    height:          8,
    backgroundColor: colors.surface2,
    borderRadius:    4,
    marginBottom:    spacing.sm,
    overflow:        'hidden',
  },
  scoreBarFill: { height: 8, borderRadius: 4 },
  scoreLabel: {
    fontFamily:    font.mono,
    fontSize:      10,
    marginBottom:  spacing.md,
    letterSpacing: 0.3,
  },
  rulesGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           4,
  },

  // Body text
  bodyText: {
    color:      colors.text,
    fontSize:   13,
    lineHeight: 20,
  },

  // Actions
  actionsSection: {
    marginTop:    spacing.sm,
    marginBottom: spacing.lg,
  },
  editBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    borderWidth:    1,
    borderColor:    colors.amber + '66',
    borderRadius:   radius.md,
    paddingVertical: 13,
    backgroundColor: colors.amber + '11',
  },
  editBtnText: {
    fontFamily: font.mono,
    fontSize:   13,
    color:      colors.amber,
    fontWeight: '700',
  },
  exportBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    borderWidth:    1,
    borderColor:    colors.blue + '66',
    borderRadius:   radius.md,
    paddingVertical: 13,
    backgroundColor: colors.blue + '11',
  },
  exportBtnText: {
    fontFamily: font.mono,
    fontSize:   13,
    color:      colors.blue,
    fontWeight: '700',
  },
});