import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { loadTrades, updateTrade, Trade } from '../store/trades';
import { colors, font, spacing, radius } from '../theme';
import {
  PrimaryButton,
  GhostButton,
  Toast,
} from '../components/UI';
import { format } from 'date-fns';
import { TextInput } from 'react-native';

// ── Reuse same components from log.tsx ──────────────────────────────────────
const STRATEGIES = [
  'Supply & Demand','Support & Resistance','Trend Following',
  'Breakout','Reversal','Scalp','ICT Order Flow','Price Action','Other',
];
const TIMEFRAMES = ['M1','M5','M15','M30','H1','H4','D1','W1'];
const SESSIONS = ['London','New York','Asian','Overlap','Other'];

const RESULTS: {
  key: 'win' | 'loss' | 'be' | 'open';
  label: string;
  color: string;
  icon: string;
}[] = [
  { key: 'win',  label: 'WIN',  color: colors.green, icon: 'trending-up' },
  { key: 'loss', label: 'LOSS', color: colors.red,   icon: 'trending-down' },
  { key: 'be',   label: 'B/E',  color: colors.amber, icon: 'remove' },
  { key: 'open', label: 'OPEN', color: colors.blue,  icon: 'time' },
];

function DarkPicker({
  label, selectedValue, onValueChange, items, accentColor = colors.muted,
}: {
  label: string; selectedValue: string;
  onValueChange: (v: string) => void;
  items: string[]; accentColor?: string;
}) {
  return (
    <View style={ps.wrapper}>
      <Text style={ps.label}>{label}</Text>
      <View style={ps.container}>
        <View style={ps.inner}>
          <Picker
            selectedValue={selectedValue}
            onValueChange={onValueChange}
            style={ps.picker}
            dropdownIconColor={colors.muted}
            mode="dropdown"
          >
            {items.map((item) => (
              <Picker.Item
                key={item} label={item} value={item}
                color={colors.text}
                style={{ backgroundColor: colors.surface2 }}
              />
            ))}
          </Picker>
        </View>
        <View style={ps.display}>
          <Text style={[ps.displayText, { color: accentColor }]}>
            {selectedValue}
          </Text>
          <Ionicons name="chevron-down" size={12} color={accentColor} />
        </View>
      </View>
    </View>
  );
}
const ps = StyleSheet.create({
  wrapper: { marginBottom: spacing.sm },
  label: {
    fontFamily: font.mono, fontSize: 9, color: colors.muted,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6,
  },
  container: {
    backgroundColor: colors.surface2, borderWidth: 0.5,
    borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden',
  },
  inner: {
    opacity: 0, height: 44, position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0, zIndex: 2,
  },
  display: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 12,
  },
  displayText: { fontFamily: font.mono, fontSize: 13, fontWeight: '600' },
  picker: { color: colors.text, height: 44, backgroundColor: colors.surface2 },
});

function DarkInput({
  label, value, onChangeText, placeholder = '', keyboardType = 'default',
  autoCapitalize = 'none', multiline = false, numberOfLines = 1,
  accentColor = colors.muted, hint,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; autoCapitalize?: any;
  multiline?: boolean; numberOfLines?: number;
  accentColor?: string; hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={is.wrapper}>
      <View style={is.labelRow}>
        <Text style={is.label}>{label}</Text>
        {hint && <Text style={is.hint}>{hint}</Text>}
      </View>
      <View style={[is.container, focused && { borderColor: accentColor + '88', backgroundColor: colors.surface }]}>
        <View style={[is.bar, { backgroundColor: focused ? accentColor : colors.border2 }]} />
        <TextInput
          value={value} onChangeText={onChangeText}
          placeholder={placeholder} placeholderTextColor={colors.muted}
          keyboardType={keyboardType} autoCapitalize={autoCapitalize}
          multiline={multiline}
          numberOfLines={multiline ? numberOfLines : undefined}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={[is.input, multiline && { minHeight: numberOfLines * 36, textAlignVertical: 'top' }]}
        />
      </View>
    </View>
  );
}
const is = StyleSheet.create({
  wrapper: { marginBottom: spacing.sm },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, textTransform: 'uppercase' },
  hint: { fontFamily: font.mono, fontSize: 9, color: colors.muted, opacity: 0.6 },
  container: {
    backgroundColor: colors.surface2, borderWidth: 0.5, borderColor: colors.border,
    borderRadius: radius.sm, overflow: 'hidden', flexDirection: 'row', alignItems: 'stretch',
  },
  bar: { width: 2, backgroundColor: colors.border2 },
  input: { flex: 1, color: colors.text, fontSize: 13, fontFamily: font.mono, paddingHorizontal: spacing.md, paddingVertical: 11 },
});

function SectionDivider({ label }: { label: string }) {
  return (
    <View style={sd.row}>
      <View style={sd.line} />
      <Text style={sd.label}>{label}</Text>
      <View style={sd.line} />
    </View>
  );
}
const sd = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md },
  line: { flex: 1, height: 0.5, backgroundColor: colors.border },
  label: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginHorizontal: spacing.sm },
});

// ══════════════════════════════════════════════════════════════════════════════
export default function EditTradeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [trade, setTrade] = useState<Trade | null>(null);
  const [pair, setPair] = useState('');
  const [dir, setDir] = useState<'BUY' | 'SELL'>('BUY');
  const [entry, setEntry] = useState('');
  const [lot, setLot] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [pnl, setPnl] = useState('');
  const [pnlSign, setPnlSign] = useState<'profit' | 'loss'>('profit');
  const [session, setSession] = useState('London');
  const [strategy, setStrategy] = useState('Supply & Demand');
  const [timeframe, setTimeframe] = useState('H1');
  const [result, setResult] = useState<'win' | 'loss' | 'be' | 'open' | null>(null);
  const [setup, setSetup] = useState('');
  const [emotions, setEmotions] = useState('');
  const [mistakes, setMistakes] = useState('');
  const [lesson, setLesson] = useState('');
  const [tags, setTags] = useState<string[]>([]); // ✅ added
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // ── Load trade and pre-fill ──────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    loadTrades().then((all) => {
      const found = all.find((t) => t.id === Number(id));
      if (!found) return;
      setTrade(found);
      setPair(found.pair);
      setDir(found.dir);
      setEntry(found.entry);
      setLot(found.lot);
      setSl(found.sl);
      setTp(found.tp);
      const absPnl = Math.abs(found.pnl);
      setPnl(absPnl > 0 ? String(absPnl) : '');
      setPnlSign(found.pnl < 0 ? 'loss' : 'profit');
      setSession(found.session);
      setStrategy(found.strategy);
      setTimeframe(found.timeframe);
      setResult(found.result);
      setSetup(found.setup || '');
      setEmotions(found.emotions || '');
      setMistakes(found.mistakes || '');
      setLesson(found.lesson || '');
      setTags(found.tags ?? []); // ✅ added
    });
  }, [id]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2300);
  };

  function getActualPnl(): number {
    const raw = parseFloat(pnl) || 0;
    return pnlSign === 'loss' ? -Math.abs(raw) : Math.abs(raw);
  }

  async function handleSave() {
    if (!trade) return;
    if (!pair.trim()) {
      Alert.alert('Missing Field', 'Please enter a trading pair.');
      return;
    }
    if (!result) {
      Alert.alert('Missing Field', 'Please select a trade result.');
      return;
    }

    const actualPnl = getActualPnl();
    const followedRules = trade.rules;
    const ruleScore = trade.ruleScore;

    // ── Discipline alert ─────────────────────────────────────────────
    if (ruleScore < 60) {
      await new Promise<void>((resolve, reject) => {
        Alert.alert(
          'Low Discipline Score',
          `This trade has a discipline score of ${Math.round(ruleScore)}%. Are you sure you want to save it?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => reject() },
            { text: 'Save Anyway', style: 'destructive', onPress: () => resolve() },
          ]
        );
      }).catch(() => { return; });
    }

    // ✅ tags included in updated trade
    const updated: Trade = {
      ...trade,
      pair: pair.toUpperCase().trim(),
      dir,
      entry,
      lot,
      sl,
      tp,
      pnl: actualPnl,
      session,
      result,
      strategy,
      timeframe,
      setup,
      emotions,
      mistakes,
      lesson,
      tags,
    };

    await updateTrade(updated);
    showToast('Trade updated');
    setTimeout(() => router.back(), 1000);
  }

  const pnlNum = getActualPnl();
  const pnlDisplayColor =
    pnlNum > 0 ? colors.green : pnlNum < 0 ? colors.red : colors.muted;

  if (!trade) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Edit Trade' }} />
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: `Edit ${trade.pair} ${trade.dir}` }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>EDITING TRADE</Text>
          </View>
          <Text style={styles.headerTitle}>
            {trade.pair} · {trade.dateStr}
          </Text>
          <Text style={styles.headerSub}>
            Modify the details below and save
          </Text>
        </View>

        {/* Instrument */}
        <SectionDivider label="INSTRUMENT" />
        <DarkInput
          label="Trading Pair" value={pair} onChangeText={setPair}
          placeholder="XAUUSD" autoCapitalize="characters"
          accentColor={colors.amber} hint="required"
        />

        {/* Direction */}
        <Text style={styles.fieldLabel}>DIRECTION</Text>
        <View style={styles.dirRow}>
          <TouchableOpacity
            onPress={() => setDir('BUY')}
            style={[styles.dirBtn, dir === 'BUY' && { backgroundColor: colors.green + '22', borderColor: colors.green }]}
          >
            <Ionicons name="trending-up" size={14} color={dir === 'BUY' ? colors.green : colors.muted} />
            <Text style={[styles.dirBtnText, { color: dir === 'BUY' ? colors.green : colors.muted }]}>BUY</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDir('SELL')}
            style={[styles.dirBtn, dir === 'SELL' && { backgroundColor: colors.red + '22', borderColor: colors.red }]}
          >
            <Ionicons name="trending-down" size={14} color={dir === 'SELL' ? colors.red : colors.muted} />
            <Text style={[styles.dirBtnText, { color: dir === 'SELL' ? colors.red : colors.muted }]}>SELL</Text>
          </TouchableOpacity>
        </View>

        {/* Price Levels */}
        <SectionDivider label="PRICE LEVELS" />
        <View style={styles.gridRow}>
          <View style={styles.gridCol}>
            <DarkInput label="Entry Price" value={entry} onChangeText={setEntry} placeholder="0.00000" keyboardType="decimal-pad" accentColor={colors.blue} />
          </View>
          <View style={{ width: spacing.sm }} />
          <View style={styles.gridCol}>
            <DarkInput label="Lot Size" value={lot} onChangeText={setLot} placeholder="0.01" keyboardType="decimal-pad" accentColor={colors.blue} />
          </View>
        </View>
        <View style={styles.gridRow}>
          <View style={styles.gridCol}>
            <DarkInput label="Stop Loss" value={sl} onChangeText={setSl} placeholder="0.00000" keyboardType="decimal-pad" accentColor={colors.red} />
          </View>
          <View style={{ width: spacing.sm }} />
          <View style={styles.gridCol}>
            <DarkInput label="Take Profit" value={tp} onChangeText={setTp} placeholder="0.00000" keyboardType="decimal-pad" accentColor={colors.green} />
          </View>
        </View>

        {/* Outcome */}
        <SectionDivider label="OUTCOME" />

        {/* P&L Sign Toggle */}
        <Text style={styles.fieldLabel}>PROFIT OR LOSS</Text>
        <View style={styles.pnlSignRow}>
          <TouchableOpacity
            onPress={() => setPnlSign('profit')}
            style={[styles.pnlSignBtn, pnlSign === 'profit' && { backgroundColor: colors.green + '22', borderColor: colors.green }]}
          >
            <Ionicons name="add-circle" size={18} color={pnlSign === 'profit' ? colors.green : colors.muted} />
            <Text style={[styles.pnlSignText, { color: pnlSign === 'profit' ? colors.green : colors.muted }]}>PROFIT</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPnlSign('loss')}
            style={[styles.pnlSignBtn, pnlSign === 'loss' && { backgroundColor: colors.red + '22', borderColor: colors.red }]}
          >
            <Ionicons name="remove-circle" size={18} color={pnlSign === 'loss' ? colors.red : colors.muted} />
            <Text style={[styles.pnlSignText, { color: pnlSign === 'loss' ? colors.red : colors.muted }]}>LOSS</Text>
          </TouchableOpacity>
        </View>

        <DarkInput
          label="Amount ($)" value={pnl.replace('-', '')}
          onChangeText={(v) => setPnl(v.replace(/[^0-9.]/g, ''))}
          placeholder="0.00" keyboardType="decimal-pad"
          accentColor={pnlDisplayColor}
        />

        {pnl ? (
          <View style={styles.pnlPreview}>
            <Text style={[styles.pnlPreviewText, { color: pnlDisplayColor }]}>
              {pnlSign === 'loss' ? '- ' : '+ '}$
              {Math.abs(parseFloat(pnl) || 0).toFixed(2)}
            </Text>
          </View>
        ) : null}

        {/* Result */}
        <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>TRADE RESULT</Text>
        <View style={styles.resultRow}>
          {RESULTS.map((r) => {
            const active = result === r.key;
            return (
              <TouchableOpacity
                key={r.key} onPress={() => setResult(r.key)} activeOpacity={0.7}
                style={[
                  styles.resultPill,
                  active
                    ? { backgroundColor: r.color + '22', borderColor: r.color, borderWidth: 1 }
                    : { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 0.5 },
                ]}
              >
                <Ionicons name={r.icon as any} size={16} color={active ? r.color : colors.muted} />
                <Text style={[styles.resultPillText, { color: active ? r.color : colors.muted }]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Session & Strategy */}
        <SectionDivider label="SESSION & STRATEGY" />
        <DarkPicker label="Session" selectedValue={session} onValueChange={setSession} items={SESSIONS} accentColor={colors.purple} />
        <DarkPicker label="Strategy" selectedValue={strategy} onValueChange={setStrategy} items={STRATEGIES} accentColor={colors.amber} />
        <DarkPicker label="Timeframe" selectedValue={timeframe} onValueChange={setTimeframe} items={TIMEFRAMES} accentColor={colors.blue} />

        {/* Journal */}
        <SectionDivider label="JOURNAL" />
        <DarkInput label="Setup Notes" value={setup} onChangeText={setSetup} placeholder="Describe your setup..." multiline numberOfLines={3} accentColor={colors.amber} />
        <DarkInput label="Emotions" value={emotions} onChangeText={setEmotions} placeholder="What did you feel?" multiline numberOfLines={2} accentColor={colors.blue} />
        <DarkInput label="Mistakes" value={mistakes} onChangeText={setMistakes} placeholder="What went wrong?" multiline numberOfLines={2} accentColor={colors.red} />
        <DarkInput label="Lesson Learned" value={lesson} onChangeText={setLesson} placeholder="What will you do differently?" multiline numberOfLines={2} accentColor={colors.green} />

        {/* Buttons */}
        <View style={styles.buttons}>
          <PrimaryButton label="Save Changes" onPress={handleSave} />
          <View style={{ height: spacing.sm }} />
          <GhostButton label="Cancel" onPress={() => router.back()} />
        </View>
      </ScrollView>

      <Toast message={toastMsg} visible={toastVisible} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.muted, fontFamily: font.mono, fontSize: 13 },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  headerBadge: {
    backgroundColor: colors.amber + '22', borderWidth: 1,
    borderColor: colors.amber + '55', borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 4, marginBottom: spacing.sm,
  },
  headerBadgeText: { fontFamily: font.mono, fontSize: 9, color: colors.amber, letterSpacing: 1.5 },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 4 },
  headerSub: { fontFamily: font.mono, fontSize: 11, color: colors.muted, textAlign: 'center' },
  fieldLabel: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginBottom: 8 },
  dirRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  dirBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: radius.sm,
    borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  dirBtnText: { fontFamily: font.mono, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  gridRow: { flexDirection: 'row' },
  gridCol: { flex: 1 },
  pnlSignRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  pnlSignBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: radius.sm,
    borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  pnlSignText: { fontFamily: font.mono, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  pnlPreview: { backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center', marginTop: spacing.xs, marginBottom: spacing.sm },
  pnlPreviewText: { fontFamily: font.mono, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  resultRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  resultPill: { flex: 1, paddingVertical: 12, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', gap: 4 },
  resultPillText: { fontFamily: font.mono, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  buttons: { marginTop: spacing.md },
});