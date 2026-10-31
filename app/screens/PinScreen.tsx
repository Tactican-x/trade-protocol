import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Switch,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  loadPin,
  savePin,
  saveDuressPin,
  isDuressPinSet,
  verifyPin,
  loadPinData,
  setBiometricsEnabled,
  isBiometricsEnabled,
  resetLockout,
} from '../store/journal';
import { colors, font, spacing, radius } from '../theme';
import { useAppContext } from '../context/AppContext';

// ─────────────────────────────────────────────────────────────────────────────
// PIN Dot
// ─────────────────────────────────────────────────────────────────────────────

function PinDot({
  filled,
  color,
  error,
}: {
  filled: boolean;
  color:  string;
  error:  boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (filled) {
      Animated.parallel([
        Animated.sequence([
          Animated.spring(scaleAnim, {
            toValue: 1.35, tension: 300, friction: 8, useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1, tension: 200, friction: 10, useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [filled]);

  const dotColor = error ? colors.red : color;

  return (
    <View style={dotStyles.wrapper}>
      {filled && (
        <Animated.View
          style={[
            dotStyles.glow,
            {
              backgroundColor: dotColor + '30',
              opacity:         glowAnim,
              transform:       [{ scale: scaleAnim }],
            },
          ]}
        />
      )}
      <Animated.View
        style={[
          dotStyles.dot,
          filled
            ? {
                backgroundColor: dotColor,
                borderColor:     dotColor,
                shadowColor:     dotColor,
                shadowOffset:    { width: 0, height: 0 },
                shadowOpacity:   0.6,
                shadowRadius:    8,
                elevation:       6,
              }
            : {
                backgroundColor: 'transparent',
                borderColor:     colors.border,
              },
          { transform: [{ scale: scaleAnim }] },
        ]}
      />
    </View>
  );
}

const dotStyles = StyleSheet.create({
  wrapper: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
    margin:         6,
  },
  glow: {
    position:     'absolute',
    width:        36,
    height:       36,
    borderRadius: 18,
  },
  dot: {
    width:        18,
    height:       18,
    borderRadius: 9,
    borderWidth:  2,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Keypad Button
// ─────────────────────────────────────────────────────────────────────────────

function KeyBtn({
  label,
  onPress,
  sub,
}: {
  label:   string;
  onPress: () => void;
  sub?:    string;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.85, duration: 70, useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1, tension: 300, friction: 8, useNativeDriver: true,
        }),
      ]),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={1}>
      <Animated.View style={[kbStyles.btn, { transform: [{ scale: scaleAnim }] }]}>
        <Text style={kbStyles.label}>{label}</Text>
        {sub && <Text style={kbStyles.sub}>{sub}</Text>}
      </Animated.View>
    </TouchableOpacity>
  );
}

const kbStyles = StyleSheet.create({
  btn: {
    width:           76,
    height:          76,
    borderRadius:    38,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.12,
    shadowRadius:    6,
    elevation:       3,
  },
  label: {
    color:      colors.text,
    fontSize:   24,
    fontWeight: '300',
    fontFamily: font.mono,
    lineHeight: 28,
  },
  sub: {
    fontFamily:    font.mono,
    fontSize:      7,
    color:         colors.muted,
    letterSpacing: 1.5,
    marginTop:     1,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

// Extended mode type — includes duress PIN flows
type Mode =
  | 'menu'
  | 'set'
  | 'confirm'
  | 'verify_remove'
  | 'verify_change'
  | 'set_duress'           // entering new duress PIN
  | 'confirm_duress'       // confirming new duress PIN
  | 'verify_remove_duress' // verify real PIN before removing duress PIN
  ;

export default function PinScreen() {
  const { accent, pinEnabled, refreshPin, isDuress } = useAppContext();

  const [mode, setMode]                 = useState<Mode>('menu');
  const [pin, setPin]                   = useState('');
  const [firstPin, setFirstPin]         = useState('');
  const [error, setError]               = useState(false);
  const [errorMsg, setErrorMsg]         = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState(5);

  // Duress PIN state
  const [duressSet, setDuressSet]       = useState(false);

  // Biometrics
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled]     = useState(false);
  const [bioType, setBioType]           = useState('Biometrics');

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // ── Entrance animation ────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 400, useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0, tension: 120, friction: 12, useNativeDriver: true,
      }),
    ]).start();
    setupBiometrics();
    checkDuressPin();
  }, []);

  // Re-animate on mode change
  useEffect(() => {
    slideAnim.setValue(20);
    fadeAnim.setValue(0);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 300, useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0, tension: 150, friction: 14, useNativeDriver: true,
      }),
    ]).start();
  }, [mode]);

  const checkDuressPin = async () => {
    const isSet = await isDuressPinSet();
    setDuressSet(isSet);
  };

  const setupBiometrics = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled  = await LocalAuthentication.isEnrolledAsync();
      const types       = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const enabled     = await isBiometricsEnabled();

      setBioAvailable(hasHardware && isEnrolled);
      setBioEnabled(enabled && hasHardware && isEnrolled);

      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBioType('Face ID');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBioType('Touch ID');
      }
    } catch {}
  };

  // ── Shake animation ───────────────────────────────────────────────────────
  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 14,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -14, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 9,   duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -9,  duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4,   duration: 35, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 35, useNativeDriver: true }),
    ]).start();
  };

  // ── Biometrics toggle ─────────────────────────────────────────────────────
  const handleBioToggle = async (value: boolean) => {
    if (value && !pinEnabled) {
      Alert.alert('Set PIN First', 'You need to set a PIN before enabling biometrics.');
      return;
    }
    await setBiometricsEnabled(value);
    setBioEnabled(value);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (value) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm biometric authentication',
        cancelLabel:   'Cancel',
      });
      if (!result.success) {
        await setBiometricsEnabled(false);
        setBioEnabled(false);
        Alert.alert('Authentication Failed', 'Biometrics could not be verified.');
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  };

  // ── Key press ─────────────────────────────────────────────────────────────
  const handleKey = (key: string) => {
    if (pin.length >= 4) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newPin = pin + key;
    setPin(newPin);
    setError(false);
    setErrorMsg('');
    if (newPin.length === 4) {
      setTimeout(() => processPin(newPin), 150);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPin((p) => p.slice(0, -1));
    setError(false);
    setErrorMsg('');
  };

  // ── Reset to menu ─────────────────────────────────────────────────────────
  const goToMenu = () => {
    setPin('');
    setError(false);
    setErrorMsg('');
    setFirstPin('');
    setMode('menu');
  };

  // ── Process PIN input ─────────────────────────────────────────────────────
  const processPin = async (entered: string) => {

    // ── Real PIN flows ──────────────────────────────────────────────────────

    if (mode === 'set') {
      setFirstPin(entered);
      setPin('');
      setMode('confirm');
      return;
    }

    if (mode === 'confirm') {
      if (entered === firstPin) {
        await savePin(entered);
        refreshPin();
        setPin('');
        setFirstPin('');
        setMode('menu');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          '🔐 PIN Set',
          'Your trading journal is now protected. The app will lock after 30 seconds in background.',
          [{ text: 'Got it' }]
        );
      } else {
        setError(true);
        setErrorMsg('PINs do not match');
        shake();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setTimeout(() => {
          setPin('');
          setError(false);
          setErrorMsg('');
          setMode('set');
        }, 700);
      }
      return;
    }

    if (mode === 'verify_remove') {
      const result = await verifyPin(entered);
      if (result.success) {
        await savePin(null);
        await setBiometricsEnabled(false);
        setBioEnabled(false);
        setDuressSet(false);
        refreshPin();
        setPin('');
        setMode('menu');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('PIN Removed', 'App lock has been disabled.');
      } else if (result.locked) {
        setError(true);
        setErrorMsg('Too many attempts — locked');
        shake();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setPin('');
        Alert.alert('Account Locked', 'Too many wrong attempts. Please wait before trying again.');
        setMode('menu');
      } else {
        setError(true);
        setErrorMsg(
          result.attemptsLeft <= 3
            ? `Wrong PIN — ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left`
            : 'Incorrect PIN'
        );
        setAttemptsLeft(result.attemptsLeft);
        shake();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setTimeout(() => { setPin(''); setError(false); setErrorMsg(''); }, 700);
      }
      return;
    }

    if (mode === 'verify_change') {
      const result = await verifyPin(entered);
      if (result.success) {
        setPin('');
        setMode('set');
      } else if (result.locked) {
        setError(true);
        shake();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setPin('');
        Alert.alert('Account Locked', 'Too many wrong attempts. Please wait before trying again.');
        setMode('menu');
      } else {
        setError(true);
        setErrorMsg(
          result.attemptsLeft <= 3
            ? `Wrong PIN — ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left`
            : 'Incorrect PIN'
        );
        setAttemptsLeft(result.attemptsLeft);
        shake();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setTimeout(() => { setPin(''); setError(false); setErrorMsg(''); }, 700);
      }
      return;
    }

    // ── Duress PIN flows ────────────────────────────────────────────────────

    if (mode === 'set_duress') {
      setFirstPin(entered);
      setPin('');
      setMode('confirm_duress');
      return;
    }

    if (mode === 'confirm_duress') {
      if (entered === firstPin) {
        // Save duress PIN — saveDuressPin returns false if it matches real PIN
        const saved = await saveDuressPin(entered);
        if (!saved) {
          // Duress PIN cannot equal real PIN
          setError(true);
          setErrorMsg('Duress PIN cannot match your real PIN');
          shake();
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setTimeout(() => {
            setPin('');
            setFirstPin('');
            setError(false);
            setErrorMsg('');
            setMode('set_duress');
          }, 900);
        } else {
          setDuressSet(true);
          setPin('');
          setFirstPin('');
          setMode('menu');
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            '🎭 Duress PIN Set',
            'If this PIN is entered at the lock screen, the app will open with no data visible. Your real data stays safe and hidden.',
            [{ text: 'Understood' }]
          );
        }
      } else {
        setError(true);
        setErrorMsg('PINs do not match');
        shake();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setTimeout(() => {
          setPin('');
          setError(false);
          setErrorMsg('');
          setMode('set_duress');
        }, 700);
      }
      return;
    }

    if (mode === 'verify_remove_duress') {
      // Require real PIN to remove duress PIN (not duress PIN itself)
      const result = await verifyPin(entered);
      if (result.success && !result.isDuress) {
        // Real PIN confirmed — remove duress PIN
        await saveDuressPin(null);
        setDuressSet(false);
        setPin('');
        setMode('menu');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Duress PIN Removed', 'Decoy mode has been disabled.');
      } else if (result.locked) {
        setError(true);
        setErrorMsg('Too many attempts — locked');
        shake();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setPin('');
        Alert.alert('Account Locked', 'Too many wrong attempts. Please wait before trying again.');
        setMode('menu');
      } else {
        // Wrong PIN or duress PIN entered (reject duress PIN here for security)
        setError(true);
        setErrorMsg('Enter your REAL PIN to continue');
        shake();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setTimeout(() => { setPin(''); setError(false); setErrorMsg(''); }, 700);
      }
      return;
    }
  };

  // ── Screen titles ─────────────────────────────────────────────────────────
  const getTitle = () => {
    switch (mode) {
      case 'menu':                 return 'App Lock';
      case 'set':                  return 'Set New PIN';
      case 'confirm':              return 'Confirm PIN';
      case 'verify_remove':        return 'Enter Current PIN';
      case 'verify_change':        return 'Verify Current PIN';
      case 'set_duress':           return 'Set Duress PIN';
      case 'confirm_duress':       return 'Confirm Duress PIN';
      case 'verify_remove_duress': return 'Verify Real PIN';
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case 'menu':
        return pinEnabled ? 'Your journal is protected' : 'No PIN set — journal is unprotected';
      case 'set':                  return 'Choose a 4-digit PIN';
      case 'confirm':              return 'Enter the same PIN again to confirm';
      case 'verify_remove':        return 'Enter your current PIN to disable lock';
      case 'verify_change':        return 'Verify your current PIN to continue';
      case 'set_duress':           return 'Choose a decoy 4-digit PIN';
      case 'confirm_duress':       return 'Re-enter your duress PIN to confirm';
      case 'verify_remove_duress': return 'Enter your REAL PIN to remove duress PIN';
    }
  };

  const KEY_SUBS: Record<string, string> = {
    '2': 'ABC', '3': 'DEF', '4': 'GHI',
    '5': 'JKL', '6': 'MNO', '7': 'PQRS',
    '8': 'TUV', '9': 'WXYZ',
  };

  const iconName   = pinEnabled ? 'lock-closed' : 'lock-open-outline';
  const iconColor  = pinEnabled ? accent : colors.red;
  const iconBg     = pinEnabled ? accent + '15' : colors.red + '15';
  const iconBorder = pinEnabled ? accent + '35' : colors.red + '35';

  // ── Progress step mode groups ─────────────────────────────────────────────
  const isConfirmStep   = mode === 'confirm' || mode === 'confirm_duress';
  const isDuressFlow    = mode === 'set_duress' || mode === 'confirm_duress';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'App Lock' }} />

      <Animated.View
        style={[
          styles.container,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.iconRingOuter}>
            <View style={styles.iconRingInner}>
              <View style={[styles.lockIcon, { backgroundColor: iconBg, borderColor: iconBorder }]}>
                <Ionicons
                  name={isDuressFlow ? 'shield-half-outline' as any : iconName as any}
                  size={30}
                  color={isDuressFlow ? colors.amber : iconColor}
                />
              </View>
            </View>
          </View>

          <Text style={styles.title}>{getTitle()}</Text>
          <Text style={styles.subtitle}>{getSubtitle()}</Text>

          {/* Status badge — menu only */}
          {mode === 'menu' && (
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: pinEnabled ? colors.green + '15' : colors.red + '15',
                  borderColor:     pinEnabled ? colors.green + '40' : colors.red + '40',
                },
              ]}
            >
              <View style={[styles.statusPulse, { backgroundColor: pinEnabled ? colors.green : colors.red }]} />
              <Text style={[styles.statusText, { color: pinEnabled ? colors.green : colors.red }]}>
                {pinEnabled ? 'PROTECTED' : 'UNPROTECTED'}
              </Text>
            </View>
          )}

          {/* Duress flow warning badge */}
          {isDuressFlow && (
            <View style={styles.duressBadge}>
              <Ionicons name="eye-off-outline" size={12} color={colors.amber} />
              <Text style={styles.duressBadgeText}>DECOY MODE SETUP</Text>
            </View>
          )}
        </View>

        {/* ══════════════════════════════════════════════════════════════
            MENU MODE
        ══════════════════════════════════════════════════════════════ */}
        {mode === 'menu' && (
          <ScrollView
            style={styles.menuScroll}
            contentContainerStyle={styles.menuContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Duress active warning banner */}
            {isDuress && (
              <View style={styles.duressActiveBanner}>
                <Ionicons name="eye-off" size={16} color={colors.amber} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.duressActiveBannerTitle}>DURESS MODE ACTIVE</Text>
                  <Text style={styles.duressActiveBannerSub}>
                    App is showing decoy data. Enter your real PIN at the lock screen to restore full access.
                  </Text>
                </View>
              </View>
            )}

            {/* ── Set / Change real PIN ────────────────────────────── */}
            <TouchableOpacity
              onPress={() => {
                setPin('');
                setError(false);
                setErrorMsg('');
                pinEnabled ? setMode('verify_change') : setMode('set');
              }}
              style={[
                styles.primaryActionBtn,
                { backgroundColor: accent + '15', borderColor: accent + '40' },
              ]}
              activeOpacity={0.75}
            >
              <View style={[styles.actionBtnIcon, { backgroundColor: accent + '20' }]}>
                <Ionicons
                  name={pinEnabled ? 'key-outline' : 'add-circle-outline'}
                  size={22}
                  color={accent}
                />
              </View>
              <View style={styles.actionBtnText}>
                <Text style={[styles.actionBtnTitle, { color: accent }]}>
                  {pinEnabled ? 'Change PIN' : 'Set PIN'}
                </Text>
                <Text style={styles.actionBtnSub}>
                  {pinEnabled ? 'Update your 4-digit security code' : 'Create a 4-digit security code'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={accent + '80'} />
            </TouchableOpacity>

            {/* ── Remove real PIN ─────────────────────────────────── */}
            {pinEnabled && (
              <TouchableOpacity
                onPress={() => {
                  setPin('');
                  setError(false);
                  setErrorMsg('');
                  setMode('verify_remove');
                }}
                style={[
                  styles.actionBtn,
                  { backgroundColor: colors.red + '10', borderColor: colors.red + '35' },
                ]}
                activeOpacity={0.75}
              >
                <View style={[styles.actionBtnIcon, { backgroundColor: colors.red + '20' }]}>
                  <Ionicons name="trash-outline" size={20} color={colors.red} />
                </View>
                <View style={styles.actionBtnText}>
                  <Text style={[styles.actionBtnTitle, { color: colors.red }]}>Remove PIN</Text>
                  <Text style={styles.actionBtnSub}>Disable app lock</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.red + '80'} />
              </TouchableOpacity>
            )}

            {/* ── Biometrics card ─────────────────────────────────── */}
            {bioAvailable && pinEnabled && (
              <View style={styles.bioCard}>
                <View style={[styles.bioCardIconBg, { backgroundColor: accent + '15' }]}>
                  <Ionicons
                    name={bioType === 'Face ID' ? 'scan-outline' : 'finger-print-outline'}
                    size={22}
                    color={accent}
                  />
                </View>
                <View style={styles.bioCardText}>
                  <Text style={styles.bioCardTitle}>{bioType}</Text>
                  <Text style={styles.bioCardSub}>Unlock without entering your PIN</Text>
                </View>
                <Switch
                  value={bioEnabled}
                  onValueChange={handleBioToggle}
                  trackColor={{ false: colors.border, true: accent + '88' }}
                  thumbColor={bioEnabled ? accent : colors.muted}
                />
              </View>
            )}

            {/* ════════════════════════════════════════════════════════
                DURESS MODE SECTION
            ════════════════════════════════════════════════════════ */}
            {pinEnabled && (
              <>
                {/* Section divider */}
                <View style={styles.sectionDivider}>
                  <View style={styles.sectionDividerLine} />
                  <Text style={styles.sectionDividerLabel}>DURESS MODE</Text>
                  <View style={styles.sectionDividerLine} />
                </View>

                {/* Explainer card */}
                <View style={styles.duressExplainer}>
                  <View style={styles.duressExplainerHeader}>
                    <Ionicons name="eye-off-outline" size={14} color={colors.amber} />
                    <Text style={styles.duressExplainerTitle}>DECOY PIN PROTECTION</Text>
                    {duressSet && (
                      <View style={styles.duressSetBadge}>
                        <View style={[styles.duressSetDot]} />
                        <Text style={styles.duressSetBadgeText}>ACTIVE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.duressExplainerText}>
                    Set a second "duress PIN". If entered at the lock screen, the app opens with
                    no data visible — your real trades, notes, and logs stay completely hidden.
                    Real data is never deleted.
                  </Text>
                  {duressSet && (
                    <View style={styles.duressFeatureRow}>
                      <Ionicons name="checkmark-circle" size={13} color={colors.green} />
                      <Text style={styles.duressFeatureText}>Biometrics always opens real mode</Text>
                    </View>
                  )}
                  {duressSet && (
                    <View style={styles.duressFeatureRow}>
                      <Ionicons name="checkmark-circle" size={13} color={colors.green} />
                      <Text style={styles.duressFeatureText}>Both PINs look identical to any observer</Text>
                    </View>
                  )}
                </View>

                {/* Set / Change duress PIN */}
                <TouchableOpacity
                  onPress={() => {
                    setPin('');
                    setError(false);
                    setErrorMsg('');
                    setMode('set_duress');
                  }}
                  style={[
                    styles.actionBtn,
                    { backgroundColor: colors.amber + '10', borderColor: colors.amber + '35' },
                  ]}
                  activeOpacity={0.75}
                >
                  <View style={[styles.actionBtnIcon, { backgroundColor: colors.amber + '20' }]}>
                    <Ionicons
                      name={duressSet ? 'refresh-outline' : 'shield-half-outline'}
                      size={20}
                      color={colors.amber}
                    />
                  </View>
                  <View style={styles.actionBtnText}>
                    <Text style={[styles.actionBtnTitle, { color: colors.amber }]}>
                      {duressSet ? 'Change Duress PIN' : 'Set Duress PIN'}
                    </Text>
                    <Text style={styles.actionBtnSub}>
                      {duressSet
                        ? 'Update your decoy PIN'
                        : 'Create a PIN that shows empty data'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.amber + '80'} />
                </TouchableOpacity>

                {/* Remove duress PIN */}
                {duressSet && (
                  <TouchableOpacity
                    onPress={() => {
                      setPin('');
                      setError(false);
                      setErrorMsg('');
                      setMode('verify_remove_duress');
                    }}
                    style={[
                      styles.actionBtn,
                      { backgroundColor: colors.muted + '18', borderColor: colors.border },
                    ]}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.actionBtnIcon, { backgroundColor: colors.surface2 }]}>
                      <Ionicons name="eye-outline" size={20} color={colors.muted} />
                    </View>
                    <View style={styles.actionBtnText}>
                      <Text style={[styles.actionBtnTitle, { color: colors.muted }]}>
                        Remove Duress PIN
                      </Text>
                      <Text style={styles.actionBtnSub}>Disable decoy mode</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted + '80'} />
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* ── Info panel ─────────────────────────────────────────── */}
            <View style={styles.infoPanel}>
              <View style={styles.infoPanelHeader}>
                <Ionicons name="shield-checkmark" size={14} color={colors.blue} />
                <Text style={styles.infoPanelTitle}>SECURITY INFO</Text>
              </View>
              <Text style={styles.infoPanelText}>
                {pinEnabled
                  ? `Your journal is locked with a hashed PIN. The app locks after 30 seconds in the background.${bioEnabled ? ` ${bioType} is enabled for quick access.` : ''}${duressSet ? ' Duress PIN active — decoy mode available.' : ''}`
                  : 'Set a PIN to protect your trading data. Your PIN is encrypted with SHA-256 before storage — it is never stored as plain text.'}
              </Text>
            </View>

            {/* ── Security features ───────────────────────────────────── */}
            <View style={styles.featuresCard}>
              <Text style={styles.featuresTitle}>SECURITY FEATURES</Text>
              {[
                { icon: 'checkmark-circle', text: 'SHA-256 hashed PIN storage',      color: colors.green },
                { icon: 'checkmark-circle', text: '5 attempt limit before lockout',  color: colors.green },
                { icon: 'checkmark-circle', text: 'Progressive lockout timer',        color: colors.green },
                { icon: 'checkmark-circle', text: 'Auto-lock after 30s background',  color: colors.green },
                {
                  icon:  duressSet ? 'checkmark-circle' : 'ellipse-outline',
                  text:  'Duress PIN / decoy mode',
                  color: duressSet ? colors.green : colors.muted,
                },
                {
                  icon:  bioAvailable ? 'checkmark-circle' : 'ellipse-outline',
                  text:  `${bioType} support`,
                  color: bioAvailable ? colors.green : colors.muted,
                },
              ].map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Ionicons name={f.icon as any} size={13} color={f.color} />
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}

        {/* ══════════════════════════════════════════════════════════════
            PIN ENTRY MODE — real and duress flows share the same keypad
        ══════════════════════════════════════════════════════════════ */}
        {mode !== 'menu' && (
          <View style={styles.pinEntryBlock}>
            {/* Progress steps for confirm modes */}
            {isConfirmStep && (
              <View style={styles.stepsRow}>
                <View style={[styles.step, { backgroundColor: isDuressFlow ? colors.amber : colors.green }]}>
                  <Ionicons name="checkmark" size={12} color={colors.bg} />
                </View>
                <View style={[styles.stepLine, { backgroundColor: isDuressFlow ? colors.amber : colors.green }]} />
                <View style={[styles.step, { backgroundColor: isDuressFlow ? colors.amber : accent }]}>
                  <Text style={styles.stepNum}>2</Text>
                </View>
                <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
                <View style={[styles.step, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.stepNum, { color: colors.muted }]}>✓</Text>
                </View>
              </View>
            )}

            {/* PIN Dots — amber for duress flows */}
            <Animated.View
              style={[
                styles.dotsRow,
                { transform: [{ translateX: shakeAnim }] },
              ]}
            >
              {[0, 1, 2, 3].map((i) => (
                <PinDot
                  key={i}
                  filled={i < pin.length}
                  color={isDuressFlow ? colors.amber : accent}
                  error={error}
                />
              ))}
            </Animated.View>

            {/* Error / hint */}
            <View style={styles.msgContainer}>
              {errorMsg ? (
                <View style={styles.errorPill}>
                  <Ionicons name="alert-circle" size={12} color={colors.red} />
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              ) : (
                <Text style={styles.hintText}>
                  {mode === 'confirm'              ? 'Re-enter your PIN to confirm'        :
                   mode === 'confirm_duress'       ? 'Re-enter your duress PIN to confirm' :
                   mode === 'set_duress'           ? 'Choose a 4-digit decoy PIN'          :
                   mode === 'verify_remove_duress' ? 'Enter your REAL PIN'                 :
                   'Enter your 4-digit PIN'}
                </Text>
              )}
            </View>

            {/* Keypad */}
            <View style={styles.keypad}>
              {[
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
              ].map((row, ri) => (
                <View key={ri} style={styles.keyRow}>
                  {row.map((k) => (
                    <KeyBtn
                      key={k}
                      label={k}
                      sub={KEY_SUBS[k]}
                      onPress={() => handleKey(k)}
                    />
                  ))}
                </View>
              ))}

              {/* Bottom row */}
              <View style={styles.keyRow}>
                <TouchableOpacity
                  onPress={goToMenu}
                  style={styles.ghostBtn}
                  activeOpacity={0.6}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>

                <KeyBtn label="0" onPress={() => handleKey('0')} />

                <TouchableOpacity
                  onPress={handleBack}
                  style={styles.ghostBtn}
                  activeOpacity={0.6}
                >
                  <Ionicons name="backspace-outline" size={26} color={colors.muted} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex:       1,
    alignItems: 'center',
    padding:    spacing.lg,
  },

  // ── Header ──
  header: {
    alignItems:   'center',
    marginBottom: spacing.xl,
    paddingTop:   spacing.md,
  },
  iconRingOuter: {
    width:           88,
    height:          88,
    borderRadius:    44,
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    spacing.md,
  },
  iconRingInner: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: colors.surface2,
    alignItems:      'center',
    justifyContent:  'center',
  },
  lockIcon: {
    width:          58,
    height:         58,
    borderRadius:   29,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  title: {
    color:         colors.text,
    fontSize:      26,
    fontWeight:    '800',
    letterSpacing: -0.5,
    marginBottom:  6,
  },
  subtitle: {
    fontFamily:   font.mono,
    fontSize:     12,
    color:        colors.muted,
    textAlign:    'center',
    lineHeight:   18,
    marginBottom: spacing.sm,
  },
  statusBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               7,
    borderWidth:       1,
    borderRadius:      radius.pill,
    paddingHorizontal: 14,
    paddingVertical:   5,
  },
  statusPulse: {
    width:        7,
    height:       7,
    borderRadius: 3.5,
  },
  statusText: {
    fontFamily:    font.mono,
    fontSize:      9,
    fontWeight:    '700',
    letterSpacing: 1.8,
  },

  // ── Duress flow badge (shown in header during duress setup) ──
  duressBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   colors.amber + '15',
    borderWidth:       1,
    borderColor:       colors.amber + '40',
    borderRadius:      radius.pill,
    paddingHorizontal: 14,
    paddingVertical:   5,
    marginTop:         4,
  },
  duressBadgeText: {
    fontFamily:    font.mono,
    fontSize:      9,
    fontWeight:    '700',
    color:         colors.amber,
    letterSpacing: 1.5,
  },

  // ── Menu ──
  menuScroll:  { width: '100%' },
  menuContent: { gap: spacing.sm, paddingBottom: 40 },

  primaryActionBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.md,
    borderWidth:       1,
    borderRadius:      radius.lg,
    paddingVertical:   16,
    paddingHorizontal: spacing.md,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 2 },
    shadowOpacity:     0.08,
    shadowRadius:      8,
    elevation:         2,
  },
  actionBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.md,
    borderWidth:       1,
    borderRadius:      radius.lg,
    paddingVertical:   14,
    paddingHorizontal: spacing.md,
  },
  actionBtnIcon: {
    width:          40,
    height:         40,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
  },
  actionBtnText:  { flex: 1 },
  actionBtnTitle: {
    fontSize:     15,
    fontWeight:   '700',
    fontFamily:   font.mono,
    marginBottom: 2,
  },
  actionBtnSub: {
    fontFamily: font.mono,
    fontSize:   10,
    color:      colors.muted,
  },

  // ── Biometrics ──
  bioCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    gap:             spacing.md,
  },
  bioCardIconBg: {
    width:          40,
    height:         40,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
  },
  bioCardText:  { flex: 1 },
  bioCardTitle: {
    fontSize:     14,
    fontWeight:   '700',
    color:        colors.text,
    marginBottom: 2,
  },
  bioCardSub: {
    fontFamily: font.mono,
    fontSize:   10,
    color:      colors.muted,
  },

  // ── Section divider (before Duress section) ──
  sectionDivider: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginTop:     spacing.xs,
  },
  sectionDividerLine: {
    flex:            1,
    height:          0.5,
    backgroundColor: colors.border,
  },
  sectionDividerLabel: {
    fontFamily:    font.mono,
    fontSize:      9,
    color:         colors.amber,
    letterSpacing: 1.5,
    fontWeight:    '700',
  },

  // ── Duress explainer card ──
  duressExplainer: {
    backgroundColor: colors.amber + '08',
    borderWidth:     0.5,
    borderColor:     colors.amber + '30',
    borderRadius:    radius.lg,
    padding:         spacing.md,
    gap:             spacing.xs,
  },
  duressExplainerHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginBottom:  4,
  },
  duressExplainerTitle: {
    fontFamily:    font.mono,
    fontSize:      9,
    color:         colors.amber,
    letterSpacing: 1.2,
    fontWeight:    '700',
    flex:          1,
  },
  duressSetBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    backgroundColor:   colors.green + '20',
    borderWidth:       0.5,
    borderColor:       colors.green + '40',
    borderRadius:      radius.pill,
    paddingHorizontal: 8,
    paddingVertical:   2,
  },
  duressSetDot: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: colors.green,
  },
  duressSetBadgeText: {
    fontFamily:    font.mono,
    fontSize:      8,
    color:         colors.green,
    fontWeight:    '700',
    letterSpacing: 1,
  },
  duressExplainerText: {
    fontFamily: font.mono,
    fontSize:   11,
    color:      colors.muted,
    lineHeight: 17,
  },
  duressFeatureRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginTop:     2,
  },
  duressFeatureText: {
    fontFamily: font.mono,
    fontSize:   10,
    color:      colors.muted,
  },

  // ── Duress active banner (shown when isDuress = true) ──
  duressActiveBanner: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             spacing.sm,
    backgroundColor: colors.amber + '15',
    borderWidth:     1,
    borderColor:     colors.amber + '50',
    borderRadius:    radius.lg,
    padding:         spacing.md,
  },
  duressActiveBannerTitle: {
    fontFamily:    font.mono,
    fontSize:      10,
    color:         colors.amber,
    fontWeight:    '800',
    letterSpacing: 1.2,
    marginBottom:  4,
  },
  duressActiveBannerSub: {
    fontFamily: font.mono,
    fontSize:   11,
    color:      colors.muted,
    lineHeight: 16,
  },

  // ── Info panel ──
  infoPanel: {
    backgroundColor: colors.blue + '0d',
    borderWidth:     0.5,
    borderColor:     colors.blue + '35',
    borderRadius:    radius.lg,
    padding:         spacing.md,
    gap:             spacing.xs,
  },
  infoPanelHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginBottom:  4,
  },
  infoPanelTitle: {
    fontFamily:    font.mono,
    fontSize:      9,
    color:         colors.blue,
    letterSpacing: 1.2,
    fontWeight:    '700',
  },
  infoPanelText: {
    fontFamily: font.mono,
    fontSize:   11,
    color:      colors.muted,
    lineHeight: 17,
  },

  // ── Features ──
  featuresCard: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    gap:             spacing.xs,
  },
  featuresTitle: {
    fontFamily:    font.mono,
    fontSize:      9,
    color:         colors.muted,
    letterSpacing: 1.5,
    marginBottom:  spacing.xs,
  },
  featureRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.sm,
    paddingVertical: 3,
  },
  featureText: {
    fontFamily: font.mono,
    fontSize:   11,
    color:      colors.muted,
  },

  // ── PIN entry block ──
  pinEntryBlock: {
    flex:           1,
    width:          '100%',
    alignItems:     'center',
    justifyContent: 'space-evenly',
  },

  // ── Steps ──
  stepsRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  step: {
    width:          24,
    height:         24,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
  },
  stepNum: {
    fontSize:   10,
    fontWeight: '800',
    color:      colors.bg,
    fontFamily: font.mono,
  },
  stepLine: {
    width:        28,
    height:       2,
    borderRadius: 1,
  },

  // ── Dots ──
  dotsRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
  },

  // ── Messages ──
  msgContainer: {
    height:         30,
    justifyContent: 'center',
    alignItems:     'center',
  },
  errorPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    backgroundColor:   colors.red + '15',
    borderWidth:       0.5,
    borderColor:       colors.red + '40',
    borderRadius:      radius.pill,
    paddingHorizontal: 12,
    paddingVertical:   5,
  },
  errorText: {
    fontFamily: font.mono,
    fontSize:   11,
    color:      colors.red,
    fontWeight: '600',
  },
  hintText: {
    fontFamily: font.mono,
    fontSize:   12,
    color:      colors.muted,
    textAlign:  'center',
  },

  // ── Keypad ──
  keypad: { gap: spacing.sm },
  keyRow: {
    flexDirection:  'row',
    gap:            spacing.md,
    justifyContent: 'center',
    alignItems:     'center',
  },
  ghostBtn: {
    width:          76,
    height:         76,
    alignItems:     'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: font.mono,
    fontSize:   13,
    color:      colors.muted,
    fontWeight: '600',
  },
});