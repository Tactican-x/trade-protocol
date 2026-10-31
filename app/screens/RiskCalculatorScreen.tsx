import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
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

// ── Persisted keys ───────────────────────────────────────────────────────────
const ACCOUNT_KEY  = 'tp_risk_calc_account_v1';
const RISK_PCT_KEY = 'tp_risk_calc_riskpct_v1';
const PIP_VAL_KEY  = 'tp_risk_calc_pipvalue_v1';

// ── Staggered Entrance Wrapper ───────────────────────────────────────────────
function FadeInUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 380, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ── Input Field ───────────────────────────────────────────────────────────────
function CalcInput({
  label, value, onChangeText, placeholder, suffix, hint, accentColor, error,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; suffix?: string; hint?: string; accentColor: string; error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.red : focused ? accentColor + '88' : undefined;
  return (
    <View style={inputStyles.wrapper}>
      <View style={inputStyles.labelRow}>
        <Text style={inputStyles.label}>{label}</Text>
        {hint && <Text style={inputStyles.hint}>{hint}</Text>}
      </View>
      <View style={[inputStyles.container, borderColor ? { borderColor } : null]}>
        <View style={[inputStyles.bar, { backgroundColor: error ? colors.red : focused ? accentColor : colors.border2 }]} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={inputStyles.input}
          accessibilityLabel={label}
          accessibilityHint={hint}
        />
        {suffix && <Text style={[inputStyles.suffix, { color: accentColor }]}>{suffix}</Text>}
      </View>
      {error && (
        <View style={inputStyles.errorRow}>
          <Ionicons name="alert-circle" size={11} color={colors.red} />
          <Text style={inputStyles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}
const inputStyles = StyleSheet.create({
  wrapper: { marginBottom: spacing.sm },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, textTransform: 'uppercase' },
  hint: { fontFamily: font.mono, fontSize: 9, color: colors.muted, opacity: 0.6 },
  container: { backgroundColor: colors.surface2, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  bar: { width: 2, alignSelf: 'stretch', backgroundColor: colors.border2 },
  input: { flex: 1, color: colors.text, fontSize: 15, fontFamily: font.mono, fontWeight: '700', paddingHorizontal: spacing.md, paddingVertical: 13 },
  suffix: { fontFamily: font.mono, fontSize: 12, paddingRight: spacing.md },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  errorText: { fontFamily: font.mono, fontSize: 9, color: colors.red },
});

// ── Result Box ────────────────────────────────────────────────────────────────
function ResultBox({ label, value, color, large }: { label: string; value: string; color: string; large?: boolean }) {
  return (
    <View style={resStyles.box}>
      <Text style={[resStyles.value, { color, fontSize: large ? 36 : 20 }]}>{value}</Text>
      <Text style={resStyles.label}>{label}</Text>
    </View>
  );
}
const resStyles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', padding: spacing.md },
  value: { fontFamily: font.mono, fontWeight: '800', marginBottom: 4 },
  label: { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1, textAlign: 'center' },
});

// ── Preset Button ─────────────────────────────────────────────────────────────
function PresetBtn({ label, onPress, active, color }: { label: string; onPress: () => void; active: boolean; color: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        presetStyles.btn,
        active && { backgroundColor: color + '22', borderColor: color },
      ]}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Set risk to ${label}`}
      accessibilityState={{ selected: active }}
    >
      <Text style={[presetStyles.label, active && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}
const presetStyles = StyleSheet.create({
  btn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface2 },
  label: { fontFamily: font.mono, fontSize: 11, color: colors.muted, fontWeight: '700' },
});

// ══════════════════════════════════════════════════════════════════════════════
export default function RiskCalculatorScreen() {
  const { accent } = useAppContext();
  const router = useRouter();

  const [accountSize, setAccountSize] = useState('10000');
  const [riskPct, setRiskPct]         = useState('1');
  const [slPips, setSlPips]           = useState('20');
  const [pipValue, setPipValue]       = useState('10');
  const [tpPips, setTpPips]           = useState('');
  const [copied, setCopied]           = useState(false);

  // ── Currency & Cent Account Preferences State ──────────────────────────────
  const [currencyCode, setCurrencyCode]   = useState('USD');
  const [isCentAccount, setIsCentAccount] = useState(false);

  const hydrated = useRef(false);

  const RISK_PRESETS = ['0.5', '1', '1.5', '2', '3'];

  // Load preferences and pre-hydrate fields
  useFocusEffect(
    useCallback(() => {
      Promise.all([
        AsyncStorage.getItem(ACCOUNT_KEY),
        AsyncStorage.getItem(RISK_PCT_KEY),
        AsyncStorage.getItem(PIP_VAL_KEY),
        AsyncStorage.getItem('@start_balance'),
        AsyncStorage.getItem('@currency'),
        AsyncStorage.getItem('@is_cent_account'),
      ]).then(([savedAccount, savedRisk, savedPip, startBalance, storedCur, storedCent]) => {
        setCurrencyCode(storedCur || 'USD');
        setIsCentAccount(storedCent === 'true');

        if (savedAccount) setAccountSize(savedAccount);
        else if (startBalance) setAccountSize(startBalance);

        if (savedRisk) setRiskPct(savedRisk);
        if (savedPip) setPipValue(savedPip);

        hydrated.current = true;
      });
    }, [])
  );

  const currencySymbol = useMemo(() => {
    return CURRENCY_SYMBOLS[currencyCode] || '$';
  }, [currencyCode]);

  // Unified formatting utility
  const formatCurrencyValue = useCallback((n: number, compact = false) => {
    const abs = Math.abs(n);
    const sign = n >= 0 ? '' : '-';
    
    if (isCentAccount) {
      return `${sign}${Math.round(abs).toLocaleString('en-US')} USC`;
    }
    
    const formattedNum = abs.toLocaleString('en-US', {
      minimumFractionDigits: compact ? 0 : 2,
      maximumFractionDigits: compact ? 0 : 2,
    });
    return `${sign}${currencySymbol}${formattedNum}`;
  }, [isCentAccount, currencySymbol]);

  // ── Persist changes (skip the initial hydration write) ──────────────────────
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(ACCOUNT_KEY, accountSize).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [accountSize]);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(RISK_PCT_KEY, riskPct).catch(() => {});
  }, [riskPct]);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(PIP_VAL_KEY, pipValue).catch(() => {});
  }, [pipValue]);

  // ── Validation ────────────────────────────────────────────────────────────
  const errors = useMemo(() => {
    const e: { accountSize?: string; riskPct?: string; slPips?: string; pipValue?: string; tpPips?: string } = {};
    const acc  = parseFloat(accountSize);
    const risk = parseFloat(riskPct);
    const sl   = parseFloat(slPips);
    const pv   = parseFloat(pipValue);
    const tp   = tpPips.trim() ? parseFloat(tpPips) : null;

    if (accountSize.trim() === '' || isNaN(acc) || acc <= 0) e.accountSize = 'Enter an account size greater than 0';
    if (riskPct.trim() === '' || isNaN(risk) || risk <= 0) e.riskPct = 'Risk % must be greater than 0';
    else if (risk > 100) e.riskPct = 'Risk % can\'t exceed 100';
    if (slPips.trim() === '' || isNaN(sl) || sl <= 0) e.slPips = 'Stop loss must be greater than 0 pips';
    if (pipValue.trim() === '' || isNaN(pv) || pv <= 0) e.pipValue = 'Pip value must be greater than 0';
    if (tpPips.trim() !== '' && (tp === null || isNaN(tp) || tp <= 0)) e.tpPips = 'Take profit must be greater than 0 pips';

    return e;
  }, [accountSize, riskPct, slPips, pipValue, tpPips]);

  const isValid = Object.keys(errors).length === 0;

  // ── Calculations ──────────────────────────────────────────────────────────
  const acc  = parseFloat(accountSize) || 0;
  const risk = parseFloat(riskPct) || 0;
  const sl   = parseFloat(slPips) || 0;
  const pv   = parseFloat(pipValue) || 0;
  const tp   = tpPips.trim() ? parseFloat(tpPips) || 0 : 0;

  const targetRiskAmount = isValid ? (acc * risk) / 100 : 0;

  const rawLotSize = isValid && sl > 0 && pv > 0 ? targetRiskAmount / (sl * pv) : 0;
  const lotSize     = Math.floor(rawLotSize * 100) / 100;
  const actualRiskAmount = lotSize * sl * pv;
  const roundingSavings  = targetRiskAmount - actualRiskAmount;

  const riskColor = risk <= 1 ? colors.green : risk <= 2 ? colors.amber : colors.red;

  // ── Risk:Reward (only when a TP is entered) ──────────────────────────────
  const hasRR = isValid && tp > 0 && sl > 0;
  const rMultiple = hasRR ? tp / sl : 0;
  const potentialReward = hasRR ? lotSize * tp * pv : 0;
  const rrColor = rMultiple >= 2 ? colors.green : rMultiple >= 1 ? colors.amber : colors.red;

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (!isValid || lotSize <= 0) return;
    const lines = [
      `Lot Size: ${lotSize.toFixed(2)}`,
      `Risk: ${formatCurrencyValue(actualRiskAmount)} (${risk}% target)`,
      `SL: ${sl} pips${tp > 0 ? ` | TP: ${tp} pips (1:${rMultiple.toFixed(2)} R)` : ''}`,
    ];
    await Clipboard.setStringAsync(lines.join('\n'));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleUseInTrade = () => {
    if (!isValid || lotSize <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/(tabs)/log',
      params: {
        lot: lotSize.toFixed(2),
        sl: slPips,
        ...(tp > 0 ? { tp: tpPips } : {}),
        riskPct,
      },
    });
  };

  const handleUseReference = (rawValue: string) => {
    const numeric = rawValue.replace(/[^0-9.]/g, '');
    if (numeric) {
      setPipValue(numeric);
      Haptics.selectionAsync();
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Risk Calculator' }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <FadeInUp delay={0}>
          <View style={styles.headerCard}>
            <View style={styles.headerIcon}>
              <Ionicons name="calculator" size={24} color={accent} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Risk Calculator</Text>
              <Text style={styles.headerSub}>
                Calculate your lot size based on account risk
              </Text>
            </View>
          </View>
        </FadeInUp>

        {/* Cent Account Warnings */}
        {isCentAccount && (
          <FadeInUp delay={20}>
            <View style={styles.centTrackerBanner}>
              <Ionicons name="sparkles" size={13} color={colors.amber} />
              <Text style={styles.centTrackerBannerText}>
                CENT ACCOUNT MODE ACTIVE (UNIT: USC)
              </Text>
            </View>
          </FadeInUp>
        )}

        {/* ── Result ───────────────────────────────────────────────────── */}
        <FadeInUp delay={40}>
          <View style={styles.resultCard}>
            <ResultBox
              label="RECOMMENDED LOT SIZE"
              value={isValid && lotSize > 0 ? lotSize.toFixed(2) : '—'}
              color={accent}
              large
            />
            <View style={styles.resultDivider} />
            <View style={styles.resultRow}>
              <ResultBox
                label="TARGET RISK"
                value={isValid ? formatCurrencyValue(targetRiskAmount) : '—'}
                color={riskColor}
              />
              <ResultBox
                label="ACTUAL RISK"
                value={isValid && lotSize > 0 ? formatCurrencyValue(actualRiskAmount) : '—'}
                color={colors.red}
              />
            </View>
            {isValid && lotSize > 0 && roundingSavings > 0.005 && (
              <Text style={styles.roundingNote}>
                Rounded down to nearest 0.01 lot — {formatCurrencyValue(roundingSavings)} under your target risk, never over.
              </Text>
            )}
            {isValid && rawLotSize > 0 && lotSize === 0 && (
              <Text style={[styles.roundingNote, { color: colors.red }]}>
                Position too small to round to a tradable 0.01 lot at this risk — increase risk % or account size.
              </Text>
            )}

            {isValid && lotSize > 0 && (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  onPress={handleCopy}
                  style={styles.actionBtn}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Copy calculation to clipboard"
                >
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? colors.green : colors.text} />
                  <Text style={[styles.actionBtnText, copied && { color: colors.green }]}>
                    {copied ? 'Copied' : 'Copy'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleUseInTrade}
                  style={[styles.actionBtn, styles.actionBtnPrimary, { backgroundColor: accent }]}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Use this lot size in a new trade"
                >
                  <Ionicons name="arrow-forward-circle" size={14} color={colors.bg} />
                  <Text style={[styles.actionBtnText, { color: colors.bg }]}>Use in New Trade</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </FadeInUp>

        {/* ── Risk:Reward (shown once a TP is entered) ───────────────────── */}
        {hasRR && (
          <FadeInUp delay={70}>
            <View style={styles.rrCard}>
              <View style={styles.rrHeader}>
                <Ionicons name="git-compare" size={14} color={rrColor} />
                <Text style={styles.rrTitle}>RISK : REWARD</Text>
              </View>
              <View style={styles.rrRow}>
                <View style={styles.rrItem}>
                  <Text style={[styles.rrValue, { color: rrColor }]}>1 : {rMultiple.toFixed(2)}</Text>
                  <Text style={styles.rrLabel}>R MULTIPLE</Text>
                </View>
                <View style={styles.rrDivider} />
                <View style={styles.rrItem}>
                  <Text style={[styles.rrValue, { color: colors.green }]}>
                    {formatCurrencyValue(potentialReward)}
                  </Text>
                  <Text style={styles.rrLabel}>POTENTIAL REWARD</Text>
                </View>
              </View>
              {rMultiple < 1 && (
                <Text style={styles.rrWarning}>Reward is smaller than risk — most systems avoid trades under 1:1.</Text>
              )}
            </View>
          </FadeInUp>
        )}

        {/* ── Risk Warning ─────────────────────────────────────────────── */}
        {isValid && risk > 2 && (
          <FadeInUp delay={90}>
            <View style={styles.warnCard}>
              <Ionicons name="warning" size={16} color={colors.red} />
              <Text style={styles.warnText}>
                {risk}% risk is HIGH. Professional traders risk 1-2% max per trade.
              </Text>
            </View>
          </FadeInUp>
        )}

        {/* ── Inputs ───────────────────────────────────────────────────── */}
        <FadeInUp delay={110}>
          <View style={styles.inputCard}>
            <View style={styles.inputHeader}>
              <Ionicons name="options" size={14} color={accent} />
              <Text style={styles.inputTitle}>TRADE PARAMETERS</Text>
            </View>

            <CalcInput
              label="Account Size"
              value={accountSize}
              onChangeText={setAccountSize}
              placeholder="10000"
              suffix={isCentAccount ? 'USC' : currencySymbol}
              accentColor={colors.blue}
              error={errors.accountSize}
            />

            <Text style={styles.riskLabel}>RISK PERCENTAGE</Text>
            <View style={styles.presetsRow}>
              {RISK_PRESETS.map((p) => (
                <PresetBtn
                  key={p}
                  label={`${p}%`}
                  active={riskPct === p}
                  color={parseFloat(p) <= 1 ? colors.green : parseFloat(p) <= 2 ? colors.amber : colors.red}
                  onPress={async () => {
                    setRiskPct(p);
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                />
              ))}
            </View>
            <CalcInput
              label="Custom Risk %"
              value={riskPct}
              onChangeText={setRiskPct}
              placeholder="1"
              suffix="%"
              accentColor={riskColor}
              error={errors.riskPct}
            />

            <CalcInput
              label="Stop Loss (pips)"
              value={slPips}
              onChangeText={setSlPips}
              placeholder="20"
              suffix="pips"
              accentColor={colors.red}
              error={errors.slPips}
            />

            <CalcInput
              label="Take Profit (pips)"
              value={tpPips}
              onChangeText={setTpPips}
              placeholder="Optional — for R:R"
              suffix="pips"
              accentColor={colors.green}
              error={errors.tpPips}
            />

            <CalcInput
              label="Pip Value"
              value={pipValue}
              onChangeText={setPipValue}
              placeholder="10"
              suffix={isCentAccount ? "USC/pip" : `${currencySymbol}/pip`}
              hint="per 1 standard lot"
              accentColor={colors.amber}
              error={errors.pipValue}
            />
          </View>
        </FadeInUp>

        {/* ── Pip Value Reference ───────────────────────────────────────── */}
        <FadeInUp delay={130}>
          <View style={styles.referenceCard}>
            <View style={styles.refHeader}>
              <Ionicons name="information-circle" size={14} color={colors.blue} />
              <Text style={styles.refTitle}>PIP VALUE REFERENCE</Text>
            </View>
            <Text style={styles.refExplainer}>
              Only pairs quoted directly in USD have a truly fixed pip value per standard lot.
              Everything else moves with the live exchange rate or your broker's contract specs — never assume.
            </Text>

            <Text style={styles.refGroupLabel}>FIXED — TAP TO USE</Text>
            {[
              { pair: 'EURUSD', value: '$10', note: 'Standard lot, USD-quote' },
              { pair: 'GBPUSD', value: '$10', note: 'Standard lot, USD-quote' },
              { pair: 'AUDUSD', value: '$10', note: 'Standard lot, USD-quote' },
              { pair: 'NZDUSD', value: '$10', note: 'Standard lot, USD-quote' },
            ].map((r) => (
              <TouchableOpacity
                key={r.pair}
                style={styles.refRow}
                onPress={() => handleUseReference(r.value)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Use ${r.value} per pip for ${r.pair}`}
              >
                <Text style={styles.refPair}>{r.pair}</Text>
                <Text style={styles.refNote}>{r.note}</Text>
                <Text style={[styles.refValue, { color: colors.amber }]}>{r.value}/pip</Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.refGroupLabel, { marginTop: spacing.md }]}>VARIES — CHECK YOUR BROKER</Text>
            {[
              { pair: 'USDJPY',   note: 'Yen pairs — pip value shifts with the live USD/JPY rate' },
              { pair: 'XAUUSD',   note: 'Gold — brokers define "1 pip" as $0.01 or $0.10; can differ 10x' },
              { pair: 'Indices',  note: 'e.g. US30 — contract size/tick value is broker-specific' },
              { pair: 'Crypto',   note: 'e.g. BTCUSD — contract size/tick value is broker-specific' },
            ].map((r) => (
              <View key={r.pair} style={styles.refRowStatic}>
                <Text style={[styles.refPair, { color: colors.muted }]}>{r.pair}</Text>
                <Text style={styles.refNoteWide}>{r.note}</Text>
              </View>
            ))}
          </View>
        </FadeInUp>

        {/* ── Formula ──────────────────────────────────────────────────── */}
        <FadeInUp delay={150}>
          <View style={styles.formulaCard}>
            <Text style={styles.formulaTitle}>FORMULA</Text>
            <Text style={styles.formulaText}>
              Lot Size = (Account × Risk%) ÷ (SL pips × Pip Value), floored to 0.01 lots
            </Text>
            <Text style={styles.formulaExample}>
              Example: ($10,000 × 1%) ÷ (20 × $10) = 0.50 lots
            </Text>
          </View>
        </FadeInUp>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 60 },

  headerCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  headerIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 2 },
  headerSub: { fontFamily: font.mono, fontSize: 10, color: colors.muted },

  resultCard: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, alignItems: 'center' },
  resultDivider: { height: 0.5, backgroundColor: colors.border, alignSelf: 'stretch', marginVertical: spacing.sm },
  resultRow: { flexDirection: 'row', alignSelf: 'stretch' },
  roundingNote: { fontFamily: font.mono, fontSize: 9, color: colors.muted, textAlign: 'center', paddingHorizontal: spacing.md, marginTop: spacing.xs, lineHeight: 14 },

  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignSelf: 'stretch' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.surface2, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10 },
  actionBtnPrimary: { borderWidth: 0 },
  actionBtnText: { fontFamily: font.mono, fontSize: 11, fontWeight: '700', color: colors.text },

  rrCard: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  rrHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  rrTitle: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5 },
  rrRow: { flexDirection: 'row', alignItems: 'center' },
  rrItem: { flex: 1, alignItems: 'center' },
  rrValue: { fontFamily: font.mono, fontSize: 20, fontWeight: '800', marginBottom: 4 },
  rrLabel: { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1 },
  rrDivider: { width: 0.5, alignSelf: 'stretch', backgroundColor: colors.border },
  rrWarning: { fontFamily: font.mono, fontSize: 9, color: colors.amber, textAlign: 'center', marginTop: spacing.sm, lineHeight: 14 },

  warnCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.red + '11', borderWidth: 1, borderColor: colors.red + '44', borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  warnText: { flex: 1, fontFamily: font.mono, fontSize: 11, color: colors.red, lineHeight: 16 },

  inputCard: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  inputHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  inputTitle: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5 },

  riskLabel: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: 8 },
  presetsRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm, flexWrap: 'wrap' },

  referenceCard: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  refHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  refTitle: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5 },
  refHint: { fontFamily: font.mono, fontSize: 8, color: colors.muted, opacity: 0.5, marginLeft: 'auto' },
  refExplainer: { fontFamily: font.mono, fontSize: 10, color: colors.amber, lineHeight: 15, marginBottom: spacing.md },
  refGroupLabel: { fontFamily: font.mono, fontSize: 8, color: colors.amber, letterSpacing: 1.5, marginBottom: 6, fontWeight: '700' },
  refRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  refRowStatic: { paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  refPair: { fontFamily: font.mono, fontSize: 11, color: colors.text, fontWeight: '700', width: 70 },
  refNote: { fontFamily: font.mono, fontSize: 10, color: colors.muted, flex: 1 },
  refNoteWide: { fontFamily: font.mono, fontSize: 10, color: colors.amber, opacity: 0.85, lineHeight: 14, marginTop: 3 },
  refValue: { fontFamily: font.mono, fontSize: 11, fontWeight: '700' },

  formulaCard: { backgroundColor: colors.surface2, borderRadius: radius.lg, padding: spacing.md },
  formulaTitle: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: spacing.sm },
  formulaText: { fontFamily: font.mono, fontSize: 11, color: colors.text, lineHeight: 18, marginBottom: 6 },
  formulaExample: { fontFamily: font.mono, fontSize: 10, color: colors.muted, fontStyle: 'italic' },

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
});n