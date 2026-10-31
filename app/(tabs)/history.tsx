import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  StatusBar,
  RefreshControl,
  LayoutAnimation,
  UIManager,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns'; // Added for production-safe dates
import {
  loadTrades,
  Trade,
  clearAllTrades,
  exportTradesAsFile,
  calcStats,
  groupTradesByMonth,
  getMonthKey,
  deleteTrade,
} from '../store/trades';
import { colors, font, spacing, radius } from '../theme';
import { TradeCard } from '../components/TradeCard';
import { Toast } from '../components/UI';

// Enable smooth LayoutAnimation transitions on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

// ── Filter Config ─────────────────────────────────────────────────────────────
type FilterType = 'all' | 'win' | 'loss' | 'be' | 'open';
const FILTERS: { key: FilterType; label: string; icon: string; color: string }[] = [
  { key: 'all',  label: 'All',    icon: 'grid',          color: colors.text  },
  { key: 'win',  label: 'Wins',   icon: 'trending-up',   color: colors.green },
  { key: 'loss', label: 'Losses', icon: 'trending-down', color: colors.red   },
  { key: 'be',   label: 'B/E',    icon: 'remove',        color: colors.amber },
  { key: 'open', label: 'Open',   icon: 'time',          color: colors.blue  },
];

// ── Sort Config ───────────────────────────────────────────────────────────────
type SortType = 'newest' | 'oldest' | 'pnl_high' | 'pnl_low' | 'discipline';
const SORTS: { key: SortType; label: string; icon: string }[] = [
  { key: 'newest',     label: 'Newest',     icon: 'arrow-down'       },
  { key: 'oldest',     label: 'Oldest',     icon: 'arrow-up'         },
  { key: 'pnl_high',   label: 'P&L High',   icon: 'trending-up'      },
  { key: 'pnl_low',    label: 'P&L Low',    icon: 'trending-down'    },
  { key: 'discipline', label: 'Discipline', icon: 'shield-checkmark' },
];

// ── Date Helpers (Production Safe) ───────────────────────────────────────────
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

// ── Staggered Entrance Wrapper ───────────────────────────────────────────────
function FadeInUp({ children, delay = 0, active = true }: { children: React.ReactNode; delay?: number; active?: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    if (!active) return;
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

// ─────────────────────────────────────────────────────────────────────────────
// Reset Journey Modal (Updated for Currencies / Cent Account Modes)
// ─────────────────────────────────────────────────────────────────────────────
type ResetStep = 'overview' | 'backup' | 'confirm' | 'executing' | 'done';

function ResetJourneyModal({
  visible,
  trades,
  onClose,
  onComplete,
  formatFn,
}: {
  visible:    boolean;
  trades:     Trade[];
  onClose:    () => void;
  onComplete: () => void;
  formatFn:   (n: number) => string;
}) {
  const insets                          = useSafeAreaInsets();
  const [step, setStep]                 = useState<ResetStep>('overview');
  const [resetWord, setResetWord]       = useState('');
  const [exporting, setExporting]       = useState(false);
  const [exported, setExported]         = useState(false);
  const [keyboardVisible, setKbVisible] = useState(false);
  const slideAnim                       = useRef(new Animated.Value(300)).current;
  const opacityAnim                     = useRef(new Animated.Value(0)).current;
  const progressAnim                    = useRef(new Animated.Value(0)).current;
  const scrollRef                       = useRef<ScrollView>(null);
  const inputRef                        = useRef<TextInput>(null);

  const isResetConfirmed = resetWord.trim().toUpperCase() === 'RESET';

  const stats         = calcStats(trades);
  const totalPnlColor = stats.totalPnl > 0 ? colors.green : stats.totalPnl < 0 ? colors.red : colors.muted;
  const pnlStr        = formatFn(stats.totalPnl);
  const discColor     = stats.avgDiscipline >= 80 ? colors.green : stats.avgDiscipline >= 60 ? colors.amber : colors.red;

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKbVisible(true);
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }, 150);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      setStep('overview');
      setResetWord('');
      setExported(false);
      progressAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      slideAnim.setValue(300);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }, 100);
  }, [step]);

  const handleExport = async () => {
    try {
      setExporting(true);
      await exportTradesAsFile();
      setExported(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setExporting(false);
    }
  };

  const handleReset = async () => {
    setStep('executing');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    progressAnim.setValue(0);
    Animated.timing(progressAnim, { toValue: 1, duration: 1200, useNativeDriver: false }).start();
    await new Promise((r) => setTimeout(r, 1200));
    await clearAllTrades();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStep('done');
  };

  if (!visible) return null;

  const renderOverview = () => (
    <>
      <View style={resetStyles.iconBg}>
        <Ionicons name="refresh-circle" size={40} color={colors.red} />
      </View>
      <Text style={resetStyles.title}>Reset Your Journey</Text>
      <Text style={resetStyles.subtitle}>
        You are about to permanently delete all your trade history and start fresh.
      </Text>

      <View style={resetStyles.statsCard}>
        <Text style={resetStyles.statsTitle}>DATA THAT WILL BE LOST</Text>
        <View style={resetStyles.statsRow}>
          <View style={resetStyles.statItem}>
            <Text style={[resetStyles.statValue, { color: colors.blue }]}>{trades.length}</Text>
            <Text style={resetStyles.statLabel}>TRADES</Text>
          </View>
          <View style={resetStyles.statDivider} />
          <View style={resetStyles.statItem}>
            <Text style={[resetStyles.statValue, { color: totalPnlColor }]}>{pnlStr}</Text>
            <Text style={resetStyles.statLabel}>TOTAL P&L</Text>
          </View>
          <View style={resetStyles.statDivider} />
          <View style={resetStyles.statItem}>
            <Text style={[resetStyles.statValue, { color: discColor }]}>{stats.avgDiscipline}%</Text>
            <Text style={resetStyles.statLabel}>AVG DISC</Text>
          </View>
        </View>
        <View style={resetStyles.statsDividerH} />
        <View style={resetStyles.statsRow}>
          <View style={resetStyles.statItem}>
            <Text style={[resetStyles.statValue, { color: colors.green }]}>{stats.wins}</Text>
            <Text style={resetStyles.statLabel}>WINS</Text>
          </View>
          <View style={resetStyles.statDivider} />
          <View style={resetStyles.statItem}>
            <Text style={[resetStyles.statValue, { color: colors.red }]}>{stats.losses}</Text>
            <Text style={resetStyles.statLabel}>LOSSES</Text>
          </View>
          <View style={resetStyles.statDivider} />
          <View style={resetStyles.statItem}>
            <Text style={[resetStyles.statValue, { color: colors.amber }]}>{stats.winRate}%</Text>
            <Text style={resetStyles.statLabel}>WIN RATE</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        onPress={() => {
          setStep('backup');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }}
        style={resetStyles.primaryBtn}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-forward" size={16} color={colors.bg} />
        <Text style={resetStyles.primaryBtnText}>Continue to Backup</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onClose} style={resetStyles.cancelBtn} activeOpacity={0.7}>
        <Text style={resetStyles.cancelText}>Cancel — Keep My Data</Text>
      </TouchableOpacity>
    </>
  );

  const renderBackup = () => (
    <>
      <View style={[resetStyles.iconBg, { backgroundColor: colors.blue + '18' }]}>
        <Ionicons name="cloud-download" size={40} color={colors.blue} />
      </View>
      <Text style={resetStyles.title}>Backup Your Data</Text>
      <Text style={resetStyles.subtitle}>
        We strongly recommend exporting your trades before resetting. This creates a JSON backup file you can restore later.
      </Text>

      <TouchableOpacity
        onPress={handleExport}
        disabled={exporting}
        style={[
          resetStyles.exportBtn,
          exported && { borderColor: colors.green, backgroundColor: colors.green + '12' },
        ]}
        activeOpacity={0.8}
      >
        <Ionicons
          name={exported ? 'checkmark-circle' : 'share-social-outline'}
          size={20}
          color={exported ? colors.green : colors.blue}
        />
        <View style={{ flex: 1 }}>
          <Text style={[resetStyles.exportBtnText, { color: exported ? colors.green : colors.blue }]}>
            {exporting ? 'Exporting...' : exported ? 'Backup Complete ✓' : 'Export Backup Now'}
          </Text>
          <Text style={resetStyles.exportBtnSub}>{trades.length} trades · JSON format</Text>
        </View>
      </TouchableOpacity>

      {exported && (
        <View style={resetStyles.exportedNote}>
          <Ionicons name="shield-checkmark" size={14} color={colors.green} />
          <Text style={resetStyles.exportedNoteText}>
            Your data is saved. You can restore it via Settings → Import Trades.
          </Text>
        </View>
      )}

      <TouchableOpacity
        onPress={() => {
          setStep('confirm');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }}
        style={resetStyles.primaryBtn}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-forward" size={16} color={colors.bg} />
        <Text style={resetStyles.primaryBtnText}>
          {exported ? 'Continue to Final Step' : 'Skip Backup & Continue'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setStep('overview')}
        style={resetStyles.cancelBtn}
        activeOpacity={0.7}
      >
        <Text style={resetStyles.cancelText}>← Go Back</Text>
      </TouchableOpacity>
    </>
  );

  const renderConfirm = () => (
    <>
      <View style={[resetStyles.iconBg, { backgroundColor: colors.red + '18' }]}>
        <Ionicons name="warning" size={40} color={colors.red} />
      </View>
      <Text style={resetStyles.title}>Final Confirmation</Text>
      <Text style={resetStyles.subtitle}>
        This will permanently delete all {trades.length} trades. This action cannot be undone.
      </Text>

      <View style={resetStyles.typeBox}>
        <Text style={resetStyles.typeLabel}>
          Type{' '}
          <Text style={{ color: colors.red, fontWeight: '800' }}>RESET</Text>
          {' '}to confirm
        </Text>
        <TextInput
          ref={inputRef}
          value={resetWord}
          onChangeText={setResetWord}
          placeholder="Type RESET here"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
          onFocus={() => {
            setTimeout(() => {
              scrollRef.current?.scrollToEnd({ animated: true });
            }, 300);
          }}
          accessibilityLabel="Type RESET to confirm deletion"
          style={[
            resetStyles.typeInput,
            isResetConfirmed && {
              borderColor:     colors.red,
              backgroundColor: colors.red + '08',
              color:           colors.red,
            },
          ]}
        />
        {resetWord.length > 0 && !isResetConfirmed && (
          <Text style={resetStyles.typeHint}>
            {resetWord.trim().length < 5
              ? `Keep typing... ${5 - resetWord.trim().length} more`
              : 'Check spelling — must be RESET'}
          </Text>
        )}
        {isResetConfirmed && (
          <View style={resetStyles.resetReadyBadge}>
            <Ionicons name="checkmark-circle" size={12} color={colors.red} />
            <Text style={resetStyles.resetReadyText}>Ready to reset</Text>
          </View>
        )}
      </View>

      <View style={resetStyles.warningCard}>
        <Ionicons name="alert-circle" size={14} color={colors.red} />
        <Text style={resetStyles.warningText}>
          All trade history, P&L records, discipline scores, and journal entries will be permanently erased.
        </Text>
      </View>

      <TouchableOpacity
        onPress={isResetConfirmed ? handleReset : undefined}
        style={[
          resetStyles.destroyBtn,
          !isResetConfirmed && { opacity: 0.4 },
        ]}
        activeOpacity={isResetConfirmed ? 0.8 : 1}
        accessibilityRole="button"
        accessibilityLabel="Delete all and reset journey"
        accessibilityState={{ disabled: !isResetConfirmed }}
      >
        <Ionicons name="trash" size={16} color="#fff" />
        <Text style={resetStyles.destroyBtnText}>
          {isResetConfirmed ? 'DELETE ALL & RESET JOURNEY' : 'Type RESET to unlock'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setStep('backup')}
        style={resetStyles.cancelBtn}
        activeOpacity={0.7}
      >
        <Text style={resetStyles.cancelText}>← Go Back</Text>
      </TouchableOpacity>

      {keyboardVisible && <View style={{ height: 140 }} />}
    </>
  );

  const renderExecuting = () => (
    <View style={resetStyles.executingContainer}>
      <View style={[resetStyles.iconBg, { backgroundColor: colors.red + '18' }]}>
        <Ionicons name="trash" size={40} color={colors.red} />
      </View>
      <Text style={resetStyles.title}>Resetting Journey...</Text>
      <Text style={resetStyles.subtitle}>Erasing all trade data. Please wait.</Text>
      <View style={resetStyles.progressBar}>
        <Animated.View
          style={[
            resetStyles.progressFill,
            {
              backgroundColor: colors.red,
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
      </View>
    </View>
  );

  const renderDone = () => (
    <>
      <View style={[resetStyles.iconBg, { backgroundColor: colors.green + '18' }]}>
        <Ionicons name="checkmark-circle" size={40} color={colors.green} />
      </View>
      <Text style={resetStyles.title}>Fresh Start 🌱</Text>
      <Text style={resetStyles.subtitle}>
        Your journey has been reset. Every trade from here is a new chapter. Execute your system with discipline.
      </Text>

      <View style={resetStyles.freshCard}>
        <Text style={resetStyles.freshQuote}>
          "The best time to start over is right now. Trade the system, not the emotion."
        </Text>
        <Text style={resetStyles.freshAuthor}>— Trade Protocol</Text>
      </View>

      <TouchableOpacity
        onPress={() => {
          onComplete();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        style={[resetStyles.primaryBtn, { backgroundColor: colors.green }]}
        activeOpacity={0.8}
      >
        <Ionicons name="flash" size={16} color={colors.bg} />
        <Text style={resetStyles.primaryBtnText}>Start New Journey</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <View style={resetStyles.overlay}>
        <Animated.View style={[resetStyles.overlayBg, { opacity: opacityAnim }]} pointerEvents="none" />
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
          style={resetStyles.kavContainer}
        >
          <Animated.View
            style={[
              resetStyles.sheet,
              {
                transform:     [{ translateY: slideAnim }],
                paddingBottom: Math.max(insets.bottom, spacing.lg),
                maxHeight:     keyboardVisible ? '95%' : '92%',
              },
            ]}
          >
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={resetStyles.sheetContent}
            >
              <View style={resetStyles.handle} />
              {step === 'overview'  && renderOverview()}
              {step === 'backup'    && renderBackup()}
              {step === 'confirm'   && renderConfirm()}
              {step === 'executing' && renderExecuting()}
              {step === 'done'      && renderDone()}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const resetStyles = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: 'flex-end' },
  overlayBg:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.88)' },
  kavContainer: { justifyContent: 'flex-end' },
  sheet:        { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetContent: { padding: spacing.lg, alignItems: 'center' },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border2, marginBottom: spacing.lg, alignSelf: 'center' },
  iconBg:       { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.red + '18', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  title:        { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: spacing.sm },
  subtitle:     { fontFamily: font.mono, fontSize: 11, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: spacing.lg, paddingHorizontal: spacing.md },
  statsCard:    { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.red + '44', borderRadius: radius.lg, padding: spacing.md, width: '100%', marginBottom: spacing.lg },
  statsTitle:   { fontFamily: font.mono, fontSize: 9, color: colors.red, letterSpacing: 1.5, marginBottom: spacing.md, textAlign: 'center' },
  statsRow:      { flexDirection: 'row', alignItems: 'center' },
  statItem:      { flex: 1, alignItems: 'center', padding: spacing.sm },
  statValue:     { fontFamily: font.mono, fontSize: 18, fontWeight: '800', marginBottom: 2 },
  statLabel:     { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1 },
  statDivider:   { width: 0.5, alignSelf: 'stretch', backgroundColor: colors.border },
  statsDividerH: { height: 0.5, backgroundColor: colors.border, marginVertical: spacing.sm },
  exportBtn:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%', backgroundColor: colors.blue + '11', borderWidth: 1, borderColor: colors.blue + '44', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  exportBtnText: { fontFamily: font.mono, fontSize: 13, fontWeight: '700' },
  exportBtnSub:  { fontFamily: font.mono, fontSize: 9, color: colors.muted, marginTop: 2 },
  exportedNote:  { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.green + '11', borderWidth: 0.5, borderColor: colors.green + '44', borderRadius: radius.sm, padding: spacing.sm, width: '100%', marginBottom: spacing.md },
  exportedNoteText: { flex: 1, fontFamily: font.mono, fontSize: 10, color: colors.green, lineHeight: 15 },
  typeBox:       { width: '100%', marginBottom: spacing.md },
  typeLabel:     { fontFamily: font.mono, fontSize: 11, color: colors.muted, marginBottom: spacing.sm, textAlign: 'center' },
  typeInput:     { backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: font.mono, fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center', letterSpacing: 4 },
  typeHint:      { fontFamily: font.mono, fontSize: 9, color: colors.muted, textAlign: 'center', marginTop: spacing.xs },
  resetReadyBadge:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: spacing.sm, backgroundColor: colors.red + '11', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 12, alignSelf: 'center' },
  resetReadyText: { fontFamily: font.mono, fontSize: 10, fontWeight: '700', color: colors.red },
  warningCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.red + '11', borderWidth: 0.5, borderColor: colors.red + '44', borderRadius: radius.sm, padding: spacing.md, width: '100%', marginBottom: spacing.lg },
  warningText:   { flex: 1, fontFamily: font.mono, fontSize: 10, color: colors.red, lineHeight: 16 },
  destroyBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, width: '100%', backgroundColor: colors.red, borderRadius: radius.lg, paddingVertical: 14, marginBottom: spacing.sm },
  destroyBtnText:{ fontFamily: font.mono, fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  primaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, width: '100%', backgroundColor: colors.text, borderRadius: radius.lg, paddingVertical: 14, marginBottom: spacing.sm },
  primaryBtnText:{ fontFamily: font.mono, fontSize: 13, fontWeight: '800', color: colors.bg },
  cancelBtn:     { paddingVertical: 10, alignItems: 'center', width: '100%' },
  cancelText:    { fontFamily: font.mono, fontSize: 11, color: colors.muted },
  executingContainer: { alignItems: 'center', paddingVertical: spacing.xl },
  progressBar:   { width: '80%', height: 4, backgroundColor: colors.surface2, borderRadius: 2, overflow: 'hidden', marginTop: spacing.lg },
  progressFill:  { height: 4, borderRadius: 2 },
  freshCard:     { backgroundColor: colors.green + '11', borderWidth: 0.5, borderColor: colors.green + '44', borderRadius: radius.lg, padding: spacing.lg, width: '100%', marginBottom: spacing.lg },
  freshQuote:    { color: colors.text, fontSize: 13, fontStyle: 'italic', lineHeight: 20, textAlign: 'center', marginBottom: 8 },
  freshAuthor:   { fontFamily: font.mono, fontSize: 10, color: colors.green, textAlign: 'center' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <View style={divStyles.wrap}>
      <View style={divStyles.row}>
        <View style={divStyles.line} />
        <Text style={divStyles.label}>{label}</Text>
        <View style={divStyles.line} />
      </View>
    </View>
  );
}
const divStyles = StyleSheet.create({
  wrap:  { backgroundColor: colors.bg, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg },
  row:   { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.sm },
  line:  { flex: 1, height: 0.5, backgroundColor: colors.border },
  label: { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, marginHorizontal: spacing.sm },
});

function MiniPill({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <View style={pillStyles.container}>
      <View style={[pillStyles.iconBg, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={12} color={color} />
      </View>
      <View style={pillStyles.textCol}>
        <Text style={pillStyles.label}>{label}</Text>
        <Text style={[pillStyles.value, { color }]}>{value}</Text>
      </View>
    </View>
  );
}
const pillStyles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm, gap: 6 },
  iconBg:    { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  textCol:   { flex: 1 },
  label:     { fontFamily: font.mono, fontSize: 7, color: colors.muted, letterSpacing: 1, textTransform: 'uppercase' },
  value:     { fontFamily: font.mono, fontSize: 13, fontWeight: '800' },
});

// Updated DateHeader to accept formatFn dynamically
function DateHeader({ date, count, pnl, formatFn }: { date: string; count: number; pnl: number; formatFn: (n: number) => string }) {
  const pnlColor = pnl > 0 ? colors.green : pnl < 0 ? colors.red : colors.muted;
  const pnlStr   = formatFn(pnl);
  return (
    <View style={dateStyles.wrap}>
      <View style={dateStyles.container}>
        <View style={dateStyles.left}>
          <View style={dateStyles.dot} />
          <Text style={dateStyles.date}>{date}</Text>
          <View style={dateStyles.countBadge}>
            <Text style={dateStyles.countText}>{count}</Text>
          </View>
        </View>
        <Text style={[dateStyles.pnl, { color: pnlColor }]}>{pnlStr}</Text>
      </View>
    </View>
  );
}
const dateStyles = StyleSheet.create({
  wrap:       { backgroundColor: colors.bg, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg },
  container:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.sm },
  left:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border2 },
  date:       { fontFamily: font.mono, fontSize: 11, color: colors.text, fontWeight: '700', letterSpacing: 0.5 },
  countBadge: { backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  countText:  { fontFamily: font.mono, fontSize: 9, color: colors.muted },
  pnl:        { fontFamily: font.mono, fontSize: 11, fontWeight: '700' },
});

// ── Active Filter Chip ────────────────────────────────────────────────────────
function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <TouchableOpacity
      onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onClear(); }}
      style={chipStyles.chip}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Remove filter: ${label}`}
    >
      <Text style={chipStyles.chipText} numberOfLines={1}>{label}</Text>
      <Ionicons name="close" size={12} color={colors.blue} />
    </TouchableOpacity>
  );
}
const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.blue + '18', borderWidth: 0.5, borderColor: colors.blue + '55',
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 160,
  },
  chipText: { fontFamily: font.mono, fontSize: 10, color: colors.blue, fontWeight: '700' },
  clearAll: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  clearAllText: { fontFamily: font.mono, fontSize: 10, color: colors.muted, textDecorationLine: 'underline' },
});

// ── Swipeable Trade Row (Edit / Delete) ──────────────────────────────────────
function SwipeableTradeCard({
  trade,
  onPress,
  onEdit,
  onDelete,
  openRowRef,
}: {
  trade: Trade;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  openRowRef: React.MutableRefObject<Swipeable | null>;
}) {
  const rowRef = useRef<Swipeable>(null);

  const renderRightActions = () => (
    <View style={swipeStyles.actionsRow}>
      <TouchableOpacity
        onPress={() => { rowRef.current?.close(); onEdit(); }}
        style={[swipeStyles.action, { backgroundColor: colors.blue }]}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${trade.pair} trade`}
      >
        <Ionicons name="create-outline" size={18} color={colors.bg} />
        <Text style={swipeStyles.actionText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { rowRef.current?.close(); onDelete(); }}
        style={[swipeStyles.action, { backgroundColor: colors.red }]}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${trade.pair} trade`}
      >
        <Ionicons name="trash-outline" size={18} color={colors.bg} />
        <Text style={swipeStyles.actionText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Swipeable
      ref={rowRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      onSwipeableWillOpen={() => {
        if (openRowRef.current && openRowRef.current !== rowRef.current) {
          openRowRef.current.close();
        }
        openRowRef.current = rowRef.current;
      }}
    >
      <TradeCard trade={trade} onPress={onPress} />
    </Swipeable>
  );
}
const swipeStyles = StyleSheet.create({
  actionsRow: { flexDirection: 'row', alignItems: 'stretch' },
  action:     { width: 64, alignItems: 'center', justifyContent: 'center', gap: 2 },
  actionText: { fontFamily: font.mono, fontSize: 9, color: colors.bg, fontWeight: '700' },
});

// ── Date Picker Modal ─────────────────────────────────────────────────────────
function DatePickerModal({
  visible,
  currentDateId,
  tradeDatesMap,
  onSelect,
  onClose,
}: {
  visible: boolean;
  currentDateId: string;
  tradeDatesMap: Map<string, { count: number; pnl: number }>;
  onSelect: (id: string) => void;
  onClose: () => void;
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

  const monthName = format(viewMonth, 'MMMM yyyy'); // Production Safe
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const today = todayId();

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
              const isSelected = dateId === currentDateId;
              const isTodayCell = dateId === today;
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
                  <Text
                    style={[
                      pickerStyles.dayNum,
                      isSelected && { color: colors.blue, fontWeight: '800' },
                      isTodayCell && !isSelected && { color: colors.green },
                    ]}
                  >
                    {day}
                  </Text>
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
  cell:       { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 8 }, // Fixed Layout Width
  dayNum:     { fontSize: 12, color: colors.text, fontFamily: font.mono },
  dot:        { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  legend:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 10, color: colors.muted, fontFamily: font.mono },
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HISTORY SCREEN
// ══════════════════════════════════════════════════════════════════════════════
type Section = { title: string; pnl: number | null; isDateGroup: boolean; data: Trade[] };

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { month } = useLocalSearchParams<{ month?: string }>();

  const [trades, setTrades]             = useState<Trade[]>([]);
  const [loading, setLoading]           = useState(true);
  const firstLoadDone                   = useRef(false);
  const [filter, setFilter]             = useState<FilterType>('all');
  const [activeMonth, setActiveMonth]   = useState<string>('all');
  const [activeDate, setActiveDate]     = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [sort, setSort]                 = useState<SortType>('newest');
  const [showSort, setShowSort]         = useState(false);
  const [searchInput, setSearchInput]   = useState('');
  const [search, setSearch]             = useState('');
  const [showReset, setShowReset]       = useState(false);
  const [toastMsg, setToastMsg]         = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const openRowRef                      = useRef<Swipeable | null>(null);

  // Multi-Currency & Cent State
  const [currencyCode, setCurrencyCode]   = useState('USD');
  const [isCentAccount, setIsCentAccount] = useState(false);

  useEffect(() => {
    if (month) {
      setActiveMonth(month);
      setActiveDate(null);
    }
  }, [month]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(false);
    setTimeout(() => setToastVisible(true), 50);
  };

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

  useFocusEffect(
    useCallback(() => {
      // Fetch dynamic currency details from Storage
      Promise.all([
        AsyncStorage.getItem('@currency'),
        AsyncStorage.getItem('@is_cent_account'),
        loadTrades()
      ]).then(([storedCurrency, storedCentAccount, loadedTrades]) => {
        setCurrencyCode(storedCurrency || 'USD');
        setIsCentAccount(storedCentAccount === 'true');
        setTrades(loadedTrades);
        if (!firstLoadDone.current) {
          firstLoadDone.current = true;
          setLoading(false);
        }
      });
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const t = await loadTrades();
    setTrades(t);
    setRefreshing(false);
  }, []);

  const availableMonths = useMemo(() => groupTradesByMonth(trades), [trades]);

  const tradeDatesMap = useMemo(() => {
    const map = new Map<string, { count: number; pnl: number }>();
    for (const t of trades) {
      const dateId = toDateId(new Date(t.timestamp));
      const existing = map.get(dateId) || { count: 0, pnl: 0 };
      map.set(dateId, { count: existing.count + 1, pnl: existing.pnl + (t.pnl || 0) });
    }
    return map;
  }, [trades]);

  const preResultTrades = useMemo(() => {
    let result = [...trades];

    if (activeDate) {
      result = result.filter((t) => toDateId(new Date(t.timestamp)) === activeDate);
    } else if (activeMonth !== 'all') {
      result = result.filter((t) => getMonthKey(t.timestamp) === activeMonth);
    }

    if (search.trim()) {
      const q = search.trim().toUpperCase();
      result = result.filter(
        (t) =>
          t.pair.toUpperCase().includes(q) ||
          t.strategy.toUpperCase().includes(q) ||
          t.session.toUpperCase().includes(q) ||
          t.dateStr.toUpperCase().includes(q)
      );
    }

    return result;
  }, [trades, activeMonth, activeDate, search]);

  const filterCounts = useMemo(() => {
    const counts: Record<FilterType, number> = { all: preResultTrades.length, win: 0, loss: 0, be: 0, open: 0 };
    for (const t of preResultTrades) {
      if (t.result === 'win' || t.result === 'loss' || t.result === 'be' || t.result === 'open') {
        counts[t.result as FilterType]++;
      }
    }
    return counts;
  }, [preResultTrades]);

  const filtered = useMemo(() => {
    let result = filter !== 'all' ? preResultTrades.filter((t) => t.result === filter) : [...preResultTrades];

    switch (sort) {
      case 'newest':
        result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        break;
      case 'pnl_high':   result.sort((a, b) => b.pnl - a.pnl); break;
      case 'pnl_low':    result.sort((a, b) => a.pnl - b.pnl); break;
      case 'discipline': result.sort((a, b) => b.ruleScore - a.ruleScore); break;
    }

    return result;
  }, [preResultTrades, filter, sort]);

  const filteredStats = useMemo(() => {
    const wins = filtered.filter((t) => t.result === 'win').length;
    const losses = filtered.filter((t) => t.result === 'loss').length;
    const totalPnl = filtered.reduce((s, t) => s + t.pnl, 0);
    const avgDisc =
      filtered.length > 0
        ? Math.round(filtered.reduce((s, t) => s + (t.ruleScore || 0), 0) / filtered.length)
        : 0;
    const closed = wins + losses;
    const winRate = closed > 0 ? Math.round((wins / closed) * 100) : 0;
    return { wins, losses, totalPnl, avgDisc, winRate };
  }, [filtered]);

  const groupedByDate = useMemo(() => {
    if (sort !== 'newest' && sort !== 'oldest') return null;
    const map = new Map<string, Trade[]>();
    for (const t of filtered) {
      if (!map.has(t.dateStr)) map.set(t.dateStr, []);
      map.get(t.dateStr)!.push(t);
    }
    const groups: { date: string; trades: Trade[]; pnl: number }[] = [];
    for (const [date, ts] of map) {
      groups.push({ date, trades: ts, pnl: ts.reduce((s, t) => s + t.pnl, 0) });
    }
    return groups;
  }, [filtered, sort]);

  const sections: Section[] = useMemo(() => {
    if (filtered.length === 0) return [];
    if (groupedByDate) {
      return groupedByDate.map((g) => ({ title: g.date, pnl: g.pnl, isDateGroup: true, data: g.trades }));
    }
    return [{
      title: `SORTED BY ${SORTS.find((s) => s.key === sort)?.label.toUpperCase()}`,
      pnl: null,
      isDateGroup: false,
      data: filtered,
    }];
  }, [filtered, groupedByDate, sort]);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (activeDate) {
      chips.push({ key: 'date', label: getFormattedDateStr(activeDate), onClear: () => setActiveDate(null) });
    } else if (activeMonth !== 'all') {
      const m = availableMonths.find((mo) => mo.key === activeMonth);
      chips.push({ key: 'month', label: m?.label || activeMonth, onClear: () => setActiveMonth('all') });
    }
    if (filter !== 'all') {
      const f = FILTERS.find((fl) => fl.key === filter);
      chips.push({ key: 'filter', label: f?.label || filter, onClear: () => setFilter('all') });
    }
    if (search.trim()) {
      chips.push({
        key: 'search',
        label: `"${search.trim()}"`,
        onClear: () => { setSearchInput(''); setSearch(''); },
      });
    }
    return chips;
  }, [activeDate, activeMonth, filter, search, availableMonths]);

  const clearAllFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveDate(null);
    setActiveMonth('all');
    setFilter('all');
    setSearchInput('');
    setSearch('');
  };

  const pnlColor  = filteredStats.totalPnl > 0 ? colors.green : filteredStats.totalPnl < 0 ? colors.red : colors.muted;
  const discColor = filteredStats.avgDisc >= 80 ? colors.green : filteredStats.avgDisc >= 60 ? colors.amber : colors.red;
  const wrColor   = filteredStats.winRate >= 50 ? colors.green : colors.red;

  const navigateToTrade = (id: number) => {
    router.push({ pathname: '/screens/TradeDetailScreen', params: { id: String(id) } });
  };

  const navigateToEditTrade = (id: number) => {
    router.push({ pathname: '/screens/EditTradeScreen', params: { id: String(id) } });
  };

  const handleDeleteTrade = (id: number, pair: string) => {
    Alert.alert(
      'Delete trade?',
      `This will permanently delete the ${pair} trade. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTrade(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              const t = await loadTrades();
              setTrades(t);
              showToast('Trade deleted');
            } catch {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              showToast('Failed to delete trade');
            }
          },
        },
      ]
    );
  };

  const toggleSort = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowSort(!showSort);
  };

  const topPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 0
  );

  const ListHeader = () => (
    <View>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>TRADE JOURNAL</Text>
          </View>
          <Text style={styles.headerTitle}>History</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.totalBadge}>
            <Text style={styles.totalNum}>{trades.length}</Text>
            <Text style={styles.totalLabel}>TOTAL</Text>
          </View>
          {trades.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setShowReset(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              style={styles.resetBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Reset journey"
            >
              <Ionicons name="refresh" size={12} color={colors.red} />
              <Text style={styles.resetBtnText}>Reset</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Cent Account Tracker Warning Banner */}
      {isCentAccount && (
        <View style={styles.centTrackerBanner}>
          <Ionicons name="sparkles" size={13} color={colors.amber} />
          <Text style={styles.centTrackerBannerText}>
            CENT ACCOUNT UNIT METRICS ACTIVE (USC MODE)
          </Text>
        </View>
      )}

      {(availableMonths.length > 0 || trades.length > 0) && (
        <View style={styles.filterBarWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.monthRow}
          >
            <TouchableOpacity
              onPress={() => { setShowDatePicker(true); Haptics.selectionAsync(); }}
              style={[styles.calendarPickerBtn, activeDate ? styles.calendarPickerBtnActive : null]}
              accessibilityRole="button"
              accessibilityLabel="Open calendar to pick a day"
            >
              <Ionicons name="calendar-outline" size={14} color={activeDate ? colors.blue : colors.text} />
            </TouchableOpacity>

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

            <TouchableOpacity
              onPress={() => { setActiveMonth('all'); setActiveDate(null); Haptics.selectionAsync(); }}
              style={[styles.monthChip, activeMonth === 'all' && !activeDate && styles.monthChipActive]}
              accessibilityRole="button"
              accessibilityLabel="Show all time"
              accessibilityState={{ selected: activeMonth === 'all' && !activeDate }}
            >
              <Text style={[styles.monthText, activeMonth === 'all' && !activeDate && styles.monthTextActive]}>
                All Time
              </Text>
            </TouchableOpacity>

            {availableMonths.map((m) => (
              <TouchableOpacity
                key={m.key}
                onPress={() => { setActiveMonth(m.key); setActiveDate(null); Haptics.selectionAsync(); }}
                style={[styles.monthChip, activeMonth === m.key && !activeDate && styles.monthChipActive]}
                accessibilityRole="button"
                accessibilityLabel={`Show ${m.label}`}
                accessibilityState={{ selected: activeMonth === m.key && !activeDate }}
              >
                <Text style={[styles.monthText, activeMonth === m.key && !activeDate && styles.monthTextActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        keyboardShouldPersistTaps="handled"
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = filterCounts[f.key];
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => { setFilter(f.key); Haptics.selectionAsync(); }}
              activeOpacity={0.7}
              style={[
                styles.filterPill,
                active && { backgroundColor: f.color + '18', borderColor: f.color + '66' },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${f.label}, ${count} trades`}
              accessibilityState={{ selected: active }}
            >
              <Ionicons name={f.icon as any} size={13} color={active ? f.color : colors.muted} />
              <Text style={[styles.filterText, active && { color: f.color, fontWeight: '700' }]}>
                {f.label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={14} color={colors.muted} />
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search pair, strategy, session, date..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          autoCapitalize="characters"
          returnKeyType="search"
          accessibilityLabel="Search trades"
        />
        {searchInput.length > 0 && (
          <TouchableOpacity
            onPress={() => { setSearchInput(''); setSearch(''); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.sortBar}>
        <TouchableOpacity
          onPress={toggleSort}
          activeOpacity={0.7}
          style={styles.sortBtn}
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${SORTS.find((s) => s.key === sort)?.label}. Tap to change`}
        >
          <Ionicons name="swap-vertical" size={14} color={colors.muted} />
          <Text style={styles.sortBtnText}>{SORTS.find((s) => s.key === sort)?.label}</Text>
          <Ionicons name={showSort ? 'chevron-up' : 'chevron-down'} size={12} color={colors.muted} />
        </TouchableOpacity>
        <Text style={styles.resultCount}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {showSort && (
        <View style={styles.sortDropdown}>
          {SORTS.map((s) => {
            const active = sort === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setSort(s.key);
                  setShowSort(false);
                  Haptics.selectionAsync();
                }}
                activeOpacity={0.7}
                style={[styles.sortOption, active && styles.sortOptionActive]}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${s.label}`}
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={s.icon as any} size={14} color={active ? colors.green : colors.muted} />
                <Text style={[styles.sortOptionText, active && { color: colors.green }]}>{s.label}</Text>
                {active && (
                  <Ionicons name="checkmark" size={14} color={colors.green} style={{ marginLeft: 'auto' }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {activeChips.length > 0 && (
        <View style={styles.activeChipsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeChipsScroll}>
            {activeChips.map((c) => (
              <ActiveChip key={c.key} label={c.label} onClear={c.onClear} />
            ))}
            <TouchableOpacity
              onPress={clearAllFilters}
              style={chipStyles.clearAll}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
            >
              <Text style={chipStyles.clearAllText}>Clear all</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {filtered.length > 0 && (
        <FadeInUp delay={40}>
          <View style={styles.statsRow}>
            <MiniPill icon="analytics" label="WIN RATE" value={`${filteredStats.winRate}%`} color={wrColor} />
            <View style={{ width: spacing.xs }} />
            <MiniPill
              icon="cash"
              label="P&L"
              value={formatCurrencyValue(filteredStats.totalPnl, true)}
              color={pnlColor}
            />
            <View style={{ width: spacing.xs }} />
            <MiniPill icon="shield-checkmark" label="DISC" value={`${filteredStats.avgDisc}%`} color={discColor} />
          </View>
        </FadeInUp>
      )}
    </View>
  );

  const ListEmpty = () => {
    if (trades.length === 0) {
      return (
        <View style={styles.emptyBlock}>
          <View style={styles.emptyIconBg}>
            <Ionicons name="document-text-outline" size={28} color={colors.muted} />
          </View>
          <Text style={styles.emptyTitle}>Start your trading journey</Text>
          <Text style={styles.emptyText}>Log your first trade to begin tracking performance and discipline.</Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/log')}
            style={styles.emptyCta}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Log your first trade"
          >
            <Ionicons name="add" size={14} color={colors.green} />
            <Text style={styles.emptyCtaText}>Log First Trade</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyBlock}>
        <View style={styles.emptyIconBg}>
          <Ionicons name="search-outline" size={28} color={colors.muted} />
        </View>
        <Text style={styles.emptyTitle}>No trades found</Text>
        <Text style={styles.emptyText}>
          {activeDate
            ? `No trades on ${getFormattedDateStr(activeDate)}.`
            : 'Nothing matches your current filters.'}
        </Text>
        {activeChips.length > 0 && (
          <TouchableOpacity
            onPress={clearAllFilters}
            style={styles.emptyCta}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Clear filters"
          >
            <Ionicons name="close-circle-outline" size={14} color={colors.blue} />
            <Text style={[styles.emptyCtaText, { color: colors.blue }]}>Clear Filters</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={[]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} translucent={false} />
        <View style={[styles.content, { paddingTop: topPadding }]}>
          <Shimmer style={{ height: 60, borderRadius: radius.lg, marginBottom: spacing.md }} />
          <Shimmer style={{ height: 40, borderRadius: radius.lg, marginBottom: spacing.md }} />
          <Shimmer style={{ height: 40, borderRadius: radius.lg, marginBottom: spacing.md }} />
          <Shimmer style={{ height: 90, borderRadius: radius.lg, marginBottom: spacing.sm }} />
          <Shimmer style={{ height: 90, borderRadius: radius.lg, marginBottom: spacing.sm }} />
          <Shimmer style={{ height: 90, borderRadius: radius.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} translucent={false} />

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: topPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        renderSectionHeader={({ section }: { section: Section }) =>
          section.isDateGroup
            ? <DateHeader date={section.title} count={section.data.length} pnl={section.pnl || 0} formatFn={formatCurrencyValue} />
            : <SectionDivider label={section.title} />
        }
        renderItem={({ item }) => (
          <SwipeableTradeCard
            trade={item}
            onPress={() => navigateToTrade(item.id)}
            onEdit={() => navigateToEditTrade(item.id)}
            onDelete={() => handleDeleteTrade(item.id, item.pair)}
            openRowRef={openRowRef}
          />
        )}
        ListFooterComponent={
          trades.length > 0 ? (
            <TouchableOpacity
              onPress={() => {
                setShowReset(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              style={styles.resetJourneyBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Reset journey and start fresh"
            >
              <Ionicons name="refresh-circle-outline" size={16} color={colors.red} />
              <Text style={styles.resetJourneyText}>Reset Journey — Start Fresh</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {/* Date Picker Modal */}
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

      {/* Reset Journey Modal */}
      <ResetJourneyModal
        visible={showReset}
        trades={trades}
        onClose={() => setShowReset(false)}
        onComplete={() => {
          setShowReset(false);
          setTrades([]);
          showToast('🌱 Journey reset. Fresh start.');
          router.push('/(tabs)/log');
        }}
        formatFn={formatCurrencyValue}
      />

      <Toast message={toastMsg} visible={toastVisible} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.bg },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },

  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  headerLeft:      { flex: 1 },
  headerBadge:     { backgroundColor: colors.blue + '22', borderWidth: 1, borderColor: colors.blue + '55', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: spacing.sm },
  headerBadgeText: { fontFamily: font.mono, fontSize: 8, color: colors.blue, letterSpacing: 1.5 },
  headerTitle:     { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: 0.5 },
  headerRight:     { alignItems: 'center', gap: spacing.xs },
  totalBadge:      { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center' },
  totalNum:        { fontFamily: font.mono, fontSize: 22, fontWeight: '800', color: colors.blue },
  totalLabel:      { fontFamily: font.mono, fontSize: 8, color: colors.muted, letterSpacing: 1, marginTop: 2 },

  resetBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    backgroundColor:   colors.red + '11',
    borderWidth:       0.5,
    borderColor:       colors.red + '44',
    borderRadius:      radius.pill,
    paddingHorizontal: 10,
    paddingVertical:   5,
  },
  resetBtnText: { fontFamily: font.mono, fontSize: 9, color: colors.red, fontWeight: '700' },

  filterBarWrap: { marginBottom: spacing.sm },
  monthRow: { gap: spacing.sm, alignItems: 'center', paddingBottom: spacing.sm },
  calendarPickerBtn: {
    width: 36, height: 36, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  calendarPickerBtnActive: { borderColor: colors.blue, backgroundColor: colors.blue + '22' },
  dayChipActive: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.blue + '22', borderWidth: 1, borderColor: colors.blue,
    borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 8,
  },
  dayChipText: { fontSize: 12, fontWeight: '800', color: colors.blue, fontFamily: font.mono },
  monthChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  monthChipActive: { backgroundColor: colors.blue + '22', borderColor: colors.blue },
  monthText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  monthTextActive: { color: colors.blue, fontWeight: '800' },

  filterRow:  { paddingBottom: spacing.sm, gap: spacing.xs },
  filterPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface2 },
  filterText: { fontFamily: font.mono, fontSize: 11, color: colors.muted },

  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.sm },
  searchInput: { flex: 1, color: colors.text, fontFamily: font.mono, fontSize: 12 },

  sortBar:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.sm },
  sortBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  sortBtnText:      { fontFamily: font.mono, fontSize: 11, color: colors.muted },
  resultCount:      { fontFamily: font.mono, fontSize: 10, color: colors.muted },
  sortDropdown:     { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xs, marginBottom: spacing.sm },
  sortOption:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.sm },
  sortOptionActive: { backgroundColor: colors.green + '12' },
  sortOptionText:   { fontFamily: font.mono, fontSize: 12, color: colors.muted },

  activeChipsRow:    { marginBottom: spacing.sm },
  activeChipsScroll: { gap: spacing.xs, alignItems: 'center' },

  statsRow: { flexDirection: 'row', marginBottom: spacing.sm },

  emptyBlock:   { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', marginTop: spacing.md },
  emptyIconBg:  { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  emptyTitle:   { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  emptyText:    { fontFamily: font.mono, fontSize: 11, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: spacing.md },
  emptyCta:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.green + '15', borderWidth: 0.5, borderColor: colors.green + '55', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  emptyCtaText: { fontFamily: font.mono, fontSize: 11, color: colors.green, fontWeight: '700' },

  resetJourneyBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing.sm,
    marginTop:       spacing.lg,
    paddingVertical: 12,
    borderWidth:     0.5,
    borderColor:     colors.red + '33',
    borderRadius:    radius.lg,
    backgroundColor: colors.red + '08',
  },
  resetJourneyText: {
    fontFamily: font.mono,
    fontSize:   11,
    color:      colors.red,
    opacity:    0.8,
  },
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