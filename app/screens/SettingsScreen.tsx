import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker'; // Added Picker
import { loadTrades, exportTrades } from '../store/trades';
import {
  AccentColor,
  loadNotifSettings,
  saveNotifSettings,
} from '../store/journal';
import { colors, font, spacing, radius } from '../theme';
import { Toast } from '../components/UI';
import { useAppContext } from '../context/AppContext';

// ── Accent Color Options ─────────────────────────────────────────────────────
const ACCENT_OPTIONS: { key: AccentColor; label: string; color: string }[] = [
  { key: 'green',  label: 'Green',  color: '#00d68f' },
  { key: 'blue',   label: 'Blue',   color: '#4fc3f7' },
  { key: 'purple', label: 'Purple', color: '#a78bfa' },
  { key: 'amber',  label: 'Amber',  color: '#ffd166' },
  { key: 'red',    label: 'Red',    color: '#ff6b6b' },
];

// ── Currency Options ─────────────────────────────────────────────────────────
const CURRENCY_OPTIONS = [
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'KES', symbol: 'KSh', label: 'KES (KSh)' },
  { code: 'UGX', symbol: 'USh', label: 'UGX (USh)' },
  { code: 'ZAR', symbol: 'R', label: 'ZAR (R)' },
  { code: 'NGN', symbol: '₦', label: 'NGN (₦)' },
  { code: 'INR', symbol: '₹', label: 'INR (₹)' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$)' },
];

// ── Custom Dark Picker Component ──────────────────────────────────────────────
function DarkPicker({
  label,
  selectedValue,
  onValueChange,
  items,
  accentColor = colors.muted,
}: {
  label: string;
  selectedValue: string;
  onValueChange: (v: string) => void;
  items: { code: string; label: string }[];
  accentColor?: string;
}) {
  return (
    <View style={pickerStyles.wrapper}>
      <Text style={pickerStyles.label}>{label}</Text>
      <View style={pickerStyles.container}>
        <View style={pickerStyles.accentBar} />
        <View style={pickerStyles.inner}>
          <Picker
            selectedValue={selectedValue}
            onValueChange={onValueChange}
            style={pickerStyles.picker}
            dropdownIconColor={colors.muted}
            mode="dropdown"
          >
            {items.map((item) => (
              <Picker.Item
                key={item.code}
                label={item.label}
                value={item.code}
                color={colors.text}
                style={{ backgroundColor: colors.surface2 }}
              />
            ))}
          </Picker>
        </View>
        <View style={[pickerStyles.selectedIndicator, { borderColor: accentColor + '44' }]}>
          <Text style={[pickerStyles.selectedText, { color: accentColor }]}>
            {items.find((i) => i.code === selectedValue)?.label || selectedValue}
          </Text>
          <Ionicons name="chevron-down" size={12} color={accentColor} />
        </View>
      </View>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  wrapper:           { marginBottom: spacing.sm },
  label:             { fontFamily: font.mono, fontSize: 9, color: colors.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  container:         { backgroundColor: colors.surface2, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden', position: 'relative' },
  accentBar:         { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, backgroundColor: colors.border2, zIndex: 1 },
  inner:             { opacity: 0, height: 44, position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 2 },
  selectedIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 0 },
  selectedText:      { fontFamily: font.mono, fontSize: 13, fontWeight: '600' },
  picker:            { color: colors.text, height: 44, backgroundColor: colors.surface2 },
});

// ── Setting Row ───────────────────────────────────────────────────────────────
function SettingRow({
  icon,
  label,
  desc,
  color,
  right,
  onPress,
  danger,
}: {
  icon: string;
  label: string;
  desc?: string;
  color: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={srStyles.row}
    >
      <View style={[srStyles.iconBg, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={srStyles.textCol}>
        <Text style={[srStyles.label, danger && { color: colors.red }]}>
          {label}
        </Text>
        {desc && <Text style={srStyles.desc}>{desc}</Text>}
      </View>
      {right ?? (onPress && (
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      ))}
    </TouchableOpacity>
  );
}
const srStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  iconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  textCol: { flex: 1 },
  label: { color: colors.text, fontSize: 13, fontWeight: '600', marginBottom: 2 },
  desc: { fontFamily: font.mono, fontSize: 10, color: colors.muted },
});

function SectionHeader({ label }: { label: string }) {
  return <Text style={shStyles.label}>{label}</Text>;
}
const shStyles = StyleSheet.create({
  label: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.muted,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
});

// ══════════════════════════════════════════════════════════════════════════════
export default function SettingsScreen() {
  const { accent, accentKey, setAccent } = useAppContext();
  const router = useRouter();

  // Settings State
  const [notifEnabled, setNotifEnabled]   = useState(false);
  const [dailyReminder, setDailyReminder] = useState(false);
  const [weeklyReview, setWeeklyReview]   = useState(false);
  const [toastMsg, setToastMsg]           = useState('');
  const [toastVisible, setToastVisible]   = useState(false);
  const [exporting, setExporting]         = useState(false);

  // Profile & Currency State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [savedName, setSavedName]               = useState('');
  const [savedBalance, setSavedBalance]         = useState('10000');
  const [savedCurrency, setSavedCurrency]       = useState('USD');
  const [savedIsCent, setSavedIsCent]           = useState(false);

  const [name, setName]                 = useState('');
  const [balance, setBalance]           = useState('10000');
  const [currency, setCurrency]         = useState('USD');
  const [isCentAccount, setIsCentAccount] = useState(false);

  useEffect(() => {
    // Load Profile & Currency Settings
    AsyncStorage.getItem('@user_name').then((n) => { 
      if (n) { setSavedName(n); setName(n); }
    });
    AsyncStorage.getItem('@start_balance').then((b) => { 
      if (b) { setSavedBalance(b); setBalance(b); }
    });
    AsyncStorage.getItem('@currency').then((c) => {
      if (c) { setSavedCurrency(c); setCurrency(c); }
    });
    AsyncStorage.getItem('@is_cent_account').then((isCent) => {
      if (isCent) {
        const parsed = isCent === 'true';
        setSavedIsCent(parsed);
        setIsCentAccount(parsed);
      }
    });

    // Load Notifications
    Notifications.getPermissionsAsync().then(({ status }) => {
      setNotifEnabled(status === 'granted');
    });
    loadNotifSettings().then((s) => {
      setDailyReminder(s.dailyReminder);
      setWeeklyReview(s.weeklyReview);
    });
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(false);
    setTimeout(() => setToastVisible(true), 50);
  };

  // Helper to format currency
  const getFormattedBalance = (val: string, curCode: string, isCent: boolean) => {
    const numeric = Number(val);
    const selectedCur = CURRENCY_OPTIONS.find((c) => c.code === curCode);
    const symbol = selectedCur ? selectedCur.symbol : '$';
    
    if (isCent) {
      return `${numeric.toLocaleString('en-US')} USC (cents)`;
    }
    return `${symbol} ${numeric.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  // ── Profile Actions ───────────────────────────────────────────────────────
  const handleCancelEdit = () => {
    setName(savedName);
    setBalance(savedBalance);
    setCurrency(savedCurrency);
    setIsCentAccount(savedIsCent);
    setIsEditingProfile(false);
  };

  const handleSaveProfile = async () => {
    const balNum = Number(String(balance).replace(/,/g, '').trim());
    if (Number.isNaN(balNum) || balNum <= 0) {
      Alert.alert('Invalid Balance', 'Starting balance must be a number greater than 0.');
      return;
    }
    
    const formattedName = name.trim();
    const formattedBalance = String(balNum);

    await AsyncStorage.setItem('@user_name', formattedName);
    await AsyncStorage.setItem('@start_balance', formattedBalance);
    await AsyncStorage.setItem('@currency', currency);
    await AsyncStorage.setItem('@is_cent_account', isCentAccount ? 'true' : 'false');
    
    // Update local saved state
    setSavedName(formattedName);
    setSavedBalance(formattedBalance);
    setSavedCurrency(currency);
    setSavedIsCent(isCentAccount);
    setIsEditingProfile(false);

    showToast('✓ Profile updated');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── Notifications ───────────────────────────────────────────────────────
  const requestNotifications = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      setNotifEnabled(true);
      showToast('Notifications enabled');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Alert.alert('Permission Denied', 'Please enable notifications in your device settings.');
    }
  };

  const rescheduleAll = async (daily: boolean, weekly: boolean) => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (daily) {
      await Notifications.scheduleNotificationAsync({
        content: { title: '📊 Trade Protocol', body: "Have you logged today's trades? Stay disciplined!", sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 20, minute: 0 },
      });
    }
    if (weekly) {
      await Notifications.scheduleNotificationAsync({
        content: { title: '📈 Weekly Review Time', body: 'Review your trades and improve your process!', sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 10, minute: 0 },
      });
    }
  };

  const scheduleDailyReminder = async () => {
    if (!notifEnabled) { await requestNotifications(); return; }
    const newVal = !dailyReminder;
    setDailyReminder(newVal);
    await saveNotifSettings({ dailyReminder: newVal, weeklyReview });
    await rescheduleAll(newVal, weeklyReview);
    showToast(newVal ? 'Daily reminder set for 8:00 PM' : 'Daily reminder cancelled');
  };

  const scheduleWeeklyReview = async () => {
    if (!notifEnabled) { await requestNotifications(); return; }
    const newVal = !weeklyReview;
    setWeeklyReview(newVal);
    await saveNotifSettings({ dailyReminder, weeklyReview: newVal });
    await rescheduleAll(dailyReminder, newVal);
    showToast(newVal ? 'Weekly review set for Sundays 10:00 AM' : 'Weekly review cancelled');
  };

  // ── Export CSV ──────────────────────────────────────────────────────────
  const handleExportCSV = async () => {
    try {
      setExporting(true);
      const trades = await loadTrades();
      if (trades.length === 0) {
        Alert.alert('No Trades', 'You have no trades to export.');
        return;
      }
      const symbol = CURRENCY_OPTIONS.find((c) => c.code === savedCurrency)?.symbol || '$';
      const unit = savedIsCent ? 'Cents' : symbol;
      const headers = `ID,Date,Time,Pair,Direction,Result,PnL (${unit}),Session,Strategy,Timeframe,Entry,SL,TP,Lot,Discipline%,Emotions,Mistakes,Lesson\n`;
      const rows = trades.map((t) => [
        t.id, t.dateStr, t.timeStr, t.pair, t.dir, t.result,
        t.pnl.toFixed(2), t.session, t.strategy, t.timeframe,
        t.entry, t.sl, t.tp, t.lot, Math.round(t.ruleScore),
        `"${t.emotions}"`, `"${t.mistakes}"`, `"${t.lesson}"`,
      ].join(',')).join('\n');

      const csv = headers + rows;
      const { uri } = await Print.printToFileAsync({
        html: `<pre style="font-family:monospace;font-size:10px;">${csv}</pre>`,
        base64: false,
      });
      await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export Trade Protocol CSV' });
      showToast('CSV exported successfully');
    } catch (e: any) {
      Alert.alert('Export Failed', e.message);
    } finally {
      setExporting(false);
    }
  };

  // ── Export PDF ──────────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    try {
      setExporting(true);
      await exportTrades();
      showToast('PDF exported successfully');
    } catch (e: any) {
      Alert.alert('Export Failed', e.message);
    } finally {
      setExporting(false);
    }
  };

  // ── Clear Data ──────────────────────────────────────────────────────────
  const handleClearData = () => {
    Alert.alert(
      '⚠️ Clear All Data',
      'This will permanently delete ALL your trades and journal entries. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            const keysToKeep = [
              'tp_onboarding_done',
              'tp_pin_v1',
              'tp_theme_v1',
              'tp_notif_settings_v1',
              '@user_name',
              '@start_balance',
              '@currency',
              '@is_cent_account',
            ];
            const allKeys = await AsyncStorage.getAllKeys();
            const keysToDelete = allKeys.filter((k) => !keysToKeep.includes(k));
            await AsyncStorage.multiRemove(keysToDelete);
            showToast('Trade data cleared');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Settings' }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Profile & Account ───────────────────────────────────────── */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <Text style={styles.profileTitle}>PROFILE & ACCOUNT</Text>
            {!isEditingProfile && (
              <TouchableOpacity
                onPress={() => {
                  setIsEditingProfile(true);
                  Haptics.selectionAsync();
                }}
                style={styles.editBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="pencil" size={12} color={colors.text} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {isEditingProfile ? (
            <View>
              <Text style={styles.inputLabel}>DISPLAY NAME</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Alex"
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
              />

              <View style={styles.gridRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>
                    STARTING BALANCE
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={balance}
                    onChangeText={(v) => setBalance(v.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="10000"
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>

              <View style={{ marginTop: spacing.md }}>
                <DarkPicker
                  label="Account Base Currency"
                  selectedValue={currency}
                  onValueChange={setCurrency}
                  items={CURRENCY_OPTIONS}
                  accentColor={accent}
                />
              </View>

              {/* Cent Account Switch Row */}
              <View style={styles.centSwitchContainer}>
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <Text style={styles.centSwitchLabel}>CENT ACCOUNT MODE</Text>
                  <Text style={styles.centSwitchDesc}>
                    Display parameters in Cents/USC (e.g. standard $100.00 will be tracked as 10,000 USC).
                  </Text>
                </View>
                <Switch
                  value={isCentAccount}
                  onValueChange={setIsCentAccount}
                  trackColor={{ false: colors.surface2, true: accent + '66' }}
                  thumbColor={isCentAccount ? accent : colors.muted}
                />
              </View>

              <Text style={styles.inputHint}>
                Starting Balance is used to evaluate real-time equity growth and ROI% calculation on your Dashboard.
              </Text>

              <View style={styles.profileActions}>
                <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelBtn} activeOpacity={0.7}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveProfile} style={styles.saveBtn} activeOpacity={0.8}>
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.profileViewMode}>
              <View style={styles.profileViewRow}>
                <View style={styles.profileViewCol}>
                  <Text style={styles.profileViewLabel}>DISPLAY NAME</Text>
                  <Text style={styles.profileViewValue}>{savedName || 'Not Set'}</Text>
                </View>
                <View style={[styles.profileViewCol, { alignItems: 'flex-end' }]}>
                  <Text style={styles.profileViewLabel}>STARTING BALANCE</Text>
                  <Text style={[styles.profileViewValue, { color: accent }]}>
                    {getFormattedBalance(savedBalance, savedCurrency, savedIsCent)}
                  </Text>
                </View>
              </View>
              {savedIsCent && (
                <View style={styles.centBadge}>
                  <Ionicons name="sparkles" size={10} color={colors.amber} />
                  <Text style={styles.centBadgeText}>CENT ACCOUNT TRACKING ACTIVE</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Appearance ───────────────────────────────────────────────── */}
        <SectionHeader label="APPEARANCE" />
        <View style={styles.accentCard}>
          <Text style={styles.accentTitle}>ACCENT COLOR</Text>
          <View style={styles.accentRow}>
            {ACCENT_OPTIONS.map((opt) => {
              const active = accentKey === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={async () => {
                    await setAccent(opt.key);
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    showToast(`Accent: ${opt.label}`);
                  }}
                  style={[
                    styles.accentBtn,
                    {
                      backgroundColor: opt.color + '22',
                      borderColor: active ? opt.color : 'transparent',
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <View style={[styles.accentSwatch, { backgroundColor: opt.color }]} />
                  <Text style={[styles.accentLabel, active && { color: opt.color }]}>
                    {opt.label}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark-circle" size={12} color={opt.color} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Notifications ─────────────────────────────────────────────── */}
        <SectionHeader label="NOTIFICATIONS" />
        <SettingRow
          icon="notifications"
          label="Enable Notifications"
          desc={notifEnabled ? 'Notifications enabled' : 'Tap to enable'}
          color={colors.amber}
          right={
            <Switch
              value={notifEnabled}
              onValueChange={requestNotifications}
              trackColor={{ false: colors.surface2, true: accent + '66' }}
              thumbColor={notifEnabled ? accent : colors.muted}
            />
          }
        />
        <SettingRow
          icon="alarm"
          label="Daily Trade Reminder"
          desc="Every day at 8:00 PM"
          color={colors.blue}
          right={
            <Switch
              value={dailyReminder}
              onValueChange={scheduleDailyReminder}
              trackColor={{ false: colors.surface2, true: accent + '66' }}
              thumbColor={dailyReminder ? accent : colors.muted}
            />
          }
        />
        <SettingRow
          icon="calendar"
          label="Weekly Review Reminder"
          desc="Every Sunday at 10:00 AM"
          color={colors.purple}
          right={
            <Switch
              value={weeklyReview}
              onValueChange={scheduleWeeklyReview}
              trackColor={{ false: colors.surface2, true: accent + '66' }}
              thumbColor={weeklyReview ? accent : colors.muted}
            />
          }
        />

        {/* ── Import ───────────────────────────────────────────────────── */}
        <SectionHeader label="IMPORT" />
        <SettingRow
          icon="download"
          label="Import from MT4 / MT5"
          desc="Import trade history from broker statement"
          color={colors.green}
          onPress={() => router.push('/screens/ImportScreen')}
        />

        {/* ── Export ───────────────────────────────────────────────────── */}
        <SectionHeader label="EXPORT & BACKUP" />
        <SettingRow
          icon="document-text"
          label={exporting ? 'Generating PDF...' : 'Export as PDF'}
          desc="Full journal with rules and discipline scores"
          color={colors.red}
          onPress={handleExportPDF}
        />
        <SettingRow
          icon="grid"
          label={exporting ? 'Generating CSV...' : 'Export as CSV'}
          desc="Spreadsheet format for Excel / Google Sheets"
          color={colors.blue}
          onPress={handleExportCSV}
        />

        {/* ── Data Management ───────────────────────────────────────────── */}
        <SectionHeader label="DATA MANAGEMENT" />
        <SettingRow
          icon="trash"
          label="Clear All Data"
          desc="Permanently delete all trades and journal entries"
          color={colors.red}
          onPress={handleClearData}
          danger
        />

        {/* ── About ────────────────────────────────────────────────────── */}
        <SectionHeader label="ABOUT" />
        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>Trade Protocol</Text>
          <Text style={styles.aboutVersion}>Version 1.0.0</Text>
          <Text style={styles.aboutDesc}>
            A trading psychology journal designed to build discipline, track
            performance, and improve your mindset.
          </Text>
          <Text style={styles.aboutQuote}>
            "I don't chase money. I execute my system."
          </Text>
        </View>
      </ScrollView>

      <Toast message={toastMsg} visible={toastVisible} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 60 },
  gridRow: { flexDirection: 'row', gap: spacing.sm },

  // Profile Card
  profileCard: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  profileTitle: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.muted,
    letterSpacing: 1.5,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  editBtnText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.text,
    fontWeight: '700',
  },
  
  // Profile View Mode
  profileViewMode: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  profileViewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  profileViewCol: {
    flex: 1,
  },
  profileViewLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.muted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  profileViewValue: {
    fontFamily: font.mono,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  centBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.amber + '11',
    borderWidth: 0.5,
    borderColor: colors.amber + '33',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    marginTop: spacing.md,
  },
  centBadgeText: {
    fontFamily: font.mono,
    fontSize: 8,
    color: colors.amber,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Profile Edit Mode
  inputLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.muted,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: font.mono,
    fontSize: 14,
    fontWeight: '700',
  },
  inputHint: {
    marginTop: 12,
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.muted,
    lineHeight: 15,
  },
  profileActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  cancelBtnText: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.muted,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.green,
  },
  saveBtnText: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.bg,
    fontWeight: '800',
  },

  // Cent Account Switch Mode
  centSwitchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  centSwitchLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 1,
    marginBottom: 4,
  },
  centSwitchDesc: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.muted,
    lineHeight: 14,
  },

  // Accent Card
  accentCard: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  accentTitle: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.muted,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  accentRow: { flexDirection: 'row', gap: spacing.xs },
  accentBtn: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    gap: 4,
  },
  accentSwatch: { width: 20, height: 20, borderRadius: 10 },
  accentLabel: { fontFamily: font.mono, fontSize: 8, color: colors.muted },

  // About
  aboutCard: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  aboutTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 4 },
  aboutVersion: { fontFamily: font.mono, fontSize: 10, color: colors.muted, marginBottom: spacing.md },
  aboutDesc: { fontFamily: font.mono, fontSize: 11, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: spacing.md },
  aboutQuote: { fontFamily: font.mono, fontSize: 11, color: colors.green, fontStyle: 'italic', textAlign: 'center' },
});