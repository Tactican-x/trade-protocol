import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Animated,
  StatusBar,
  Dimensions,
  AppState,
  AppStateStatus,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  verifyPin,
  isBiometricsEnabled,
  VerifyResult,
} from '../store/journal';
import { colors, font, radius, spacing } from '../theme';
import { useAppContext } from '../context/AppContext';

const { width, height } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  children?: React.ReactNode;
  onUnlock?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes      = Math.floor(totalSeconds / 60);
  const seconds      = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getLockoutMessage(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds <= 60)   return `Try again in ${totalSeconds}s`;
  if (totalSeconds <= 3600) return `Try again in ${Math.ceil(totalSeconds / 60)}m`;
  return `Try again in ${Math.ceil(totalSeconds / 3600)}h`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PIN Dot
// ─────────────────────────────────────────────────────────────────────────────

function PinDot({
  filled,
  error,
  success,
  index,
  animValue,
}: {
  filled:    boolean;
  error:     boolean;
  success:   boolean;
  index:     number;
  animValue: Animated.Value;
}) {
  const scale = animValue.interpolate({
    inputRange:  [0, 1],
    outputRange: [1, 1.4],
  });

  const dotColor = error ? '#ff6b6b' : colors.green;

  return (
    <View style={dotStyles.wrapper}>
      {filled && (
        <Animated.View
          style={[
            dotStyles.glow,
            {
              backgroundColor: dotColor + '30',
              transform:       [{ scale }],
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
                shadowOpacity:   0.7,
                shadowRadius:    10,
                elevation:       8,
              }
            : {
                backgroundColor: 'transparent',
                borderColor:     colors.border,
              },
          filled && { transform: [{ scale }] },
        ]}
      />
    </View>
  );
}

const dotStyles = StyleSheet.create({
  wrapper: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
  },
  glow: {
    position:     'absolute',
    width:        34,
    height:       34,
    borderRadius: 17,
  },
  dot: {
    width:        20,
    height:       20,
    borderRadius: 10,
    borderWidth:  2,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Keypad Button
// ─────────────────────────────────────────────────────────────────────────────

function KeypadButton({
  label,
  onPress,
  disabled,
}: {
  label:     string | React.ReactNode;
  onPress:   () => void;
  disabled?: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (disabled) return;
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue:         0.84,
        duration:        65,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue:         1,
        tension:         300,
        friction:        8,
        useNativeDriver: true,
      }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={1}
      disabled={disabled}
      style={{ opacity: disabled ? 0.25 : 1 }}
    >
      <Animated.View
        style={[
          keyStyles.btn,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {typeof label === 'string' ? (
          <Text style={keyStyles.text}>{label}</Text>
        ) : (
          label
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const keyStyles = StyleSheet.create({
  btn: {
    width:           78,
    height:          78,
    borderRadius:    39,
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.15,
    shadowRadius:    8,
    elevation:       4,
  },
  text: {
    fontSize:   26,
    fontWeight: '300',
    color:      colors.text,
    fontFamily: font.mono,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

const PIN_LENGTH = 4;

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['bio', '0', 'del'],
];

export default function AppLockGate({ children, onUnlock }: Props) {
  const { enterDuress, exitDuress } = useAppContext();

  const [hasPinSet, setHasPinSet]             = useState<boolean | null>(null);
  const [unlocked, setUnlocked]               = useState(false);
  const [entered, setEntered]                 = useState('');
  const [error, setError]                     = useState(false);
  const [success, setSuccess]                 = useState(false);
  const [attemptsLeft, setAttemptsLeft]       = useState(5);
  const [locked, setLocked]                   = useState(false);
  const [lockedUntil, setLockedUntil]         = useState(0);
  const [countdown, setCountdown]             = useState(0);
  const [biometricAvailable, setBioAvailable] = useState(false);
  const [biometricEnabled, setBioEnabled]     = useState(false);
  const [biometricType, setBioType]           = useState('Biometrics');
  const [verifying, setVerifying]             = useState(false);

  const shakeAnim   = useRef(new Animated.Value(0)).current;
  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const slideAnim   = useRef(new Animated.Value(50)).current;
  const dotAnims    = useRef(
    Array.from({ length: PIN_LENGTH }, () => new Animated.Value(0))
  ).current;
  const successAnim = useRef(new Animated.Value(0)).current;
  const lockAnim    = useRef(new Animated.Value(0)).current;
  const iconPulse   = useRef(new Animated.Value(1)).current;

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Check if PIN is configured in storage ────────────────────────────────
  const checkPinStatus = async () => {
    try {
      const pin = await AsyncStorage.getItem('tp_pin_v1');
      if (pin && pin.length >= 4) {
        setHasPinSet(true);
        setUnlocked(false);
      } else {
        setHasPinSet(false);
        setUnlocked(true);
      }
    } catch {
      setHasPinSet(false);
      setUnlocked(true);
    }
  };

  // ── Initial Check & AppState Listener ────────────────────────────────────
  useEffect(() => {
    checkPinStatus();

    // Re-lock when returning from background
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const pin = await AsyncStorage.getItem('tp_pin_v1');
        if (pin && pin.length >= 4) {
          setHasPinSet(true);
          setUnlocked(false);
          setEntered('');
          setSuccess(false);
          setError(false);
        }
      }
    });

    return () => {
      subscription.remove();
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // ── Startup Animations ───────────────────────────────────────────────────
  useEffect(() => {
    if (hasPinSet && !unlocked) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue:         1,
          duration:        500,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue:         0,
          tension:         100,
          friction:        12,
          useNativeDriver: true,
        }),
      ]).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(iconPulse, {
            toValue:         1.06,
            duration:        2000,
            useNativeDriver: true,
          }),
          Animated.timing(iconPulse, {
            toValue:         1,
            duration:        2000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      setupBiometrics();
    }
  }, [hasPinSet, unlocked]);

  // ── Biometrics ────────────────────────────────────────────────────────────
  const setupBiometrics = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled  = await LocalAuthentication.isEnrolledAsync();
      const bioEnabled  = await isBiometricsEnabled();
      const types       = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const available   = hasHardware && isEnrolled;

      setBioAvailable(available);
      setBioEnabled(bioEnabled && available);

      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBioType('Face ID');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBioType('Touch ID');
      } else {
        setBioType('Biometrics');
      }

      if (available && bioEnabled) {
        setTimeout(() => triggerBiometrics(), 500);
      }
    } catch {}
  };

  const triggerBiometrics = async () => {
    if (!biometricAvailable || verifying) return;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage:         'Unlock Trade Protocol',
        cancelLabel:           'Use PIN',
        disableDeviceFallback: false,
        fallbackLabel:         'Use PIN',
      });
      if (result.success) {
        await exitDuress();
        handleSuccess();
      }
    } catch {}
  };

  // ── Countdown ─────────────────────────────────────────────────────────────
  const startCountdown = (until: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const tick = () => {
      const remaining = until - Date.now();
      if (remaining <= 0) {
        setCountdown(0);
        setLocked(false);
        setEntered('');
        if (countdownRef.current) clearInterval(countdownRef.current);
      } else {
        setCountdown(remaining);
      }
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
  };

  // ── Animations ────────────────────────────────────────────────────────────
  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 16,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -16, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10,  duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5,   duration: 35, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 35, useNativeDriver: true }),
    ]).start();
  };

  const animateDotIn = (index: number) => {
    Animated.spring(dotAnims[index], {
      toValue:         1,
      useNativeDriver: true,
      tension:         300,
      friction:        8,
    }).start();
  };

  const resetDots = () => {
    dotAnims.forEach((anim) =>
      Animated.timing(anim, {
        toValue:         0,
        duration:        180,
        useNativeDriver: true,
      }).start()
    );
  };

  const animateLockIcon = () => {
    Animated.sequence([
      Animated.timing(lockAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(lockAnim, { toValue: 0, duration: 300, useNativeDriver: true, delay: 1000 }),
    ]).start();
  };

  // ── Success handler ───────────────────────────────────────────────────────
  const handleSuccess = () => {
    setSuccess(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.timing(successAnim, {
      toValue:         1,
      duration:        300,
      useNativeDriver: true,
    }).start();

    // Call optional callback AND set unlocked state to reveal children
    setTimeout(() => {
      onUnlock?.();
      setUnlocked(true);
    }, 400);
  };

  // ── Input handlers ────────────────────────────────────────────────────────
  const handleDigit = async (digit: string) => {
    if (locked || verifying || success) return;
    if (entered.length >= PIN_LENGTH) return;

    const newVal = entered + digit;
    setEntered(newVal);
    setError(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateDotIn(newVal.length - 1);

    if (newVal.length === PIN_LENGTH) {
      setVerifying(true);
      setTimeout(async () => {
        await processPin(newVal);
        setVerifying(false);
      }, 150);
    }
  };

  const handleDelete = () => {
    if (locked || success) return;
    if (entered.length === 0) return;
    const newVal = entered.slice(0, -1);
    setEntered(newVal);
    setError(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(dotAnims[newVal.length], {
      toValue:         0,
      duration:        180,
      useNativeDriver: true,
    }).start();
  };

  // ── Core PIN processing ───────────────────────────────────────────────────
  const processPin = async (pin: string) => {
    try {
      const result: VerifyResult = await verifyPin(pin);

      if (result.success) {
        if (result.isDuress) {
          await enterDuress();
        } else {
          await exitDuress();
        }
        handleSuccess();
        return;
      }

      setError(true);
      shake();
      Vibration.vibrate(500);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      if (result.locked) {
        setLocked(true);
        setLockedUntil(result.lockedUntil);
        setCountdown(result.lockedUntil - Date.now());
        startCountdown(result.lockedUntil);
        animateLockIcon();
      } else {
        setAttemptsLeft(result.attemptsLeft);
      }

      setTimeout(() => {
        setEntered('');
        setError(false);
        resetDots();
      }, 700);
    } catch {
      setEntered('');
      resetDots();
    }
  };

  // ── IF UNLOCKED OR NO PIN SET -> RENDER APP CONTENT (CHILDREN) ────────────
  if (hasPinSet === false || unlocked) {
    return <View style={{ flex: 1 }}>{children}</View>;
  }

  // ── IF STILL CHECKING PIN STATUS ─────────────────────────────────────────
  if (hasPinSet === null) {
    return (
      <View style={[styles.overlay, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.green} size="large" />
      </View>
    );
  }

  // ── LOCK SCREEN RENDER ───────────────────────────────────────────────────
  const renderDots = () => (
    <Animated.View
      style={[
        styles.dotsRow,
        { transform: [{ translateX: shakeAnim }] },
      ]}
    >
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <PinDot
          key={i}
          index={i}
          filled={i < entered.length}
          error={error}
          success={success}
          animValue={dotAnims[i]}
        />
      ))}
    </Animated.View>
  );

  const renderStatusMessage = () => {
    if (success) {
      return (
        <View style={styles.statusPill}>
          <View style={[styles.statusPillDot, { backgroundColor: colors.green }]} />
          <Text style={[styles.statusPillText, { color: colors.green }]}>
            Unlocked
          </Text>
        </View>
      );
    }

    if (locked) {
      return (
        <View style={styles.lockoutBlock}>
          <View style={styles.lockoutBadge}>
            <Ionicons name="time-outline" size={13} color="#ff6b6b" />
            <Text style={styles.lockoutText}>
              LOCKED · {formatCountdown(countdown)}
            </Text>
          </View>
          <Text style={styles.lockoutSub}>
            Too many attempts. {getLockoutMessage(countdown)}.
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorPill}>
          <Ionicons name="alert-circle" size={13} color="#ff6b6b" />
          <Text style={styles.errorPillText}>
            Incorrect PIN
            {attemptsLeft <= 3 && attemptsLeft > 0
              ? ` · ${attemptsLeft} left`
              : ''}
          </Text>
        </View>
      );
    }

    if (attemptsLeft <= 3 && attemptsLeft < 5) {
      return (
        <View style={styles.warningPill}>
          <Ionicons name="warning-outline" size={13} color={colors.amber} />
          <Text style={styles.warningPillText}>
            {attemptsLeft} attempt{attemptsLeft === 1 ? '' : 's'} remaining
          </Text>
        </View>
      );
    }

    return (
      <Text style={styles.statusHint}>Enter your PIN to unlock</Text>
    );
  };

  const renderKeypad = () => (
    <View style={styles.keypad}>
      {KEYPAD_ROWS.map((row, ri) => (
        <View key={ri} style={styles.keyRow}>
          {row.map((key, ki) => {
            if (key === '') {
              return <View key={ki} style={{ width: 78, height: 78 }} />;
            }

            if (key === 'del') {
              return (
                <KeypadButton
                  key={ki}
                  disabled={locked || success}
                  onPress={handleDelete}
                  label={
                    <Ionicons
                      name="backspace-outline"
                      size={26}
                      color={colors.muted}
                    />
                  }
                />
              );
            }

            if (key === 'bio') {
              if (!biometricAvailable || !biometricEnabled) {
                return <View key={ki} style={{ width: 78, height: 78 }} />;
              }
              return (
                <KeypadButton
                  key={ki}
                  disabled={locked || success}
                  onPress={triggerBiometrics}
                  label={
                    <Ionicons
                      name={
                        biometricType === 'Face ID'
                          ? 'scan-outline'
                          : 'finger-print-outline'
                      }
                      size={30}
                      color={colors.green}
                    />
                  }
                />
              );
            }

            return (
              <KeypadButton
                key={ki}
                disabled={locked || success || verifying}
                onPress={() => handleDigit(key)}
                label={key}
              />
            );
          })}
        </View>
      ))}
    </View>
  );

  const lockScale = lockAnim.interpolate({
    inputRange:  [0, 0.5, 1],
    outputRange: [1, 1.25, 1],
  });
  const successScale = successAnim.interpolate({
    inputRange:  [0, 0.5, 1],
    outputRange: [1, 1.2, 1],
  });

  const iconBg = success
    ? colors.green + '20'
    : locked
    ? '#ff6b6b18'
    : colors.green + '15';

  const iconBorder = success
    ? colors.green + '50'
    : locked
    ? '#ff6b6b40'
    : colors.green + '30';

  const iconName = success
    ? 'shield-checkmark'
    : locked
    ? 'lock-closed'
    : 'shield-half';

  const iconColor = success
    ? colors.green
    : locked
    ? '#ff6b6b'
    : colors.green;

  return (
    <View style={styles.overlay}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <Animated.View
        style={[
          styles.content,
          {
            opacity:   fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.brandSection}>
          <View style={styles.ringOuter}>
            <View style={styles.ringMiddle}>
              <Animated.View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: iconBg,
                    borderColor:     iconBorder,
                    transform: [
                      {
                        scale: success
                          ? successScale
                          : locked
                          ? lockScale
                          : iconPulse,
                      },
                    ],
                  },
                ]}
              >
                <Ionicons name={iconName as any} size={32} color={iconColor} />
              </Animated.View>
            </View>
          </View>

          <Text style={styles.brandTitle}>Trade Protocol</Text>
          <Text style={styles.brandSub}>
            {success
              ? 'Welcome back 👋'
              : locked
              ? 'Account temporarily locked'
              : 'Protected journal'}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.dotsSection}>
          {renderDots()}
          <View style={styles.statusContainer}>
            {renderStatusMessage()}
          </View>
        </View>

        {renderKeypad()}

        {biometricAvailable && biometricEnabled && !locked && !success && (
          <TouchableOpacity
            style={styles.bioHint}
            onPress={triggerBiometrics}
            activeOpacity={0.6}
          >
            <View style={styles.bioHintInner}>
              <Ionicons
                name={
                  biometricType === 'Face ID'
                    ? 'scan-outline'
                    : 'finger-print-outline'
                }
                size={15}
                color={colors.muted}
              />
              <Text style={styles.bioHintText}>Use {biometricType}</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.footer}>
          <View style={[styles.footerDot, { backgroundColor: colors.green }]} />
          <Text style={styles.footerText}>Encrypted · Secure · Private</Text>
          <View style={[styles.footerDot, { backgroundColor: colors.green }]} />
        </View>
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    bottom:          0,
    backgroundColor: colors.bg,
    zIndex:          9999,
    justifyContent:  'center',
    alignItems:      'center',
  },
  content: {
    width:             '100%',
    alignItems:        'center',
    paddingHorizontal: 28,
    gap:               28,
  },
  brandSection: {
    alignItems: 'center',
    gap:        10,
  },
  ringOuter: {
    width:           100,
    height:          100,
    borderRadius:    50,
    borderWidth:     0.5,
    borderColor:     colors.border,
    backgroundColor: colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
  },
  ringMiddle: {
    width:           80,
    height:          80,
    borderRadius:    40,
    borderWidth:     0.5,
    borderColor:     colors.border,
    backgroundColor: colors.surface2,
    alignItems:      'center',
    justifyContent:  'center',
  },
  iconWrap: {
    width:          64,
    height:         64,
    borderRadius:   20,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize:      22,
    fontWeight:    '800',
    color:         colors.text,
    letterSpacing: -0.3,
    fontFamily:    font.mono,
  },
  brandSub: {
    fontFamily: font.mono,
    fontSize:   12,
    color:      colors.muted,
    textAlign:  'center',
  },
  divider: {
    width:           60,
    height:          1,
    backgroundColor: colors.border,
    borderRadius:    1,
  },
  dotsSection: {
    alignItems: 'center',
    gap:        16,
  },
  dotsRow: {
    flexDirection: 'row',
    gap:           16,
  },
  statusContainer: {
    height:         32,
    justifyContent: 'center',
    alignItems:     'center',
  },
  statusHint: {
    fontFamily:    font.mono,
    fontSize:      12,
    color:         colors.muted,
    letterSpacing: 0.3,
  },
  statusPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   colors.green + '15',
    borderWidth:       0.5,
    borderColor:       colors.green + '40',
    borderRadius:      radius.pill,
    paddingHorizontal: 14,
    paddingVertical:   5,
  },
  statusPillDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  statusPillText: {
    fontFamily: font.mono,
    fontSize:   12,
    fontWeight: '700',
  },
  errorPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    backgroundColor:   '#ff6b6b15',
    borderWidth:       0.5,
    borderColor:       '#ff6b6b40',
    borderRadius:      radius.pill,
    paddingHorizontal: 14,
    paddingVertical:   5,
  },
  errorPillText: {
    fontFamily: font.mono,
    fontSize:   12,
    color:      '#ff6b6b',
    fontWeight: '600',
  },
  warningPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    backgroundColor:   colors.amber + '15',
    borderWidth:       0.5,
    borderColor:       colors.amber + '40',
    borderRadius:      radius.pill,
    paddingHorizontal: 14,
    paddingVertical:   5,
  },
  warningPillText: {
    fontFamily: font.mono,
    fontSize:   12,
    color:      colors.amber,
    fontWeight: '600',
  },
  lockoutBlock: {
    alignItems: 'center',
    gap:        6,
  },
  lockoutBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   '#ff6b6b15',
    borderWidth:       0.5,
    borderColor:       '#ff6b6b40',
    borderRadius:      radius.pill,
    paddingHorizontal: 14,
    paddingVertical:   5,
  },
  lockoutText: {
    fontFamily:    font.mono,
    fontSize:      12,
    fontWeight:    '700',
    color:         '#ff6b6b',
    letterSpacing: 0.5,
  },
  lockoutSub: {
    fontFamily: font.mono,
    fontSize:   10,
    color:      colors.muted,
    textAlign:  'center',
  },
  keypad: {
    gap: 14,
  },
  keyRow: {
    flexDirection:  'row',
    gap:            20,
    justifyContent: 'center',
    alignItems:     'center',
  },
  bioHint: {
    paddingVertical: 8,
  },
  bioHintInner: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   colors.surface,
    borderWidth:       0.5,
    borderColor:       colors.border,
    borderRadius:      radius.pill,
    paddingHorizontal: 16,
    paddingVertical:   8,
  },
  bioHintText: {
    fontFamily: font.mono,
    fontSize:   12,
    color:      colors.muted,
  },
  footer: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  footerDot: {
    width:        4,
    height:       4,
    borderRadius: 2,
    opacity:      0.5,
  },
  footerText: {
    fontFamily:    font.mono,
    fontSize:      9,
    color:         colors.muted,
    letterSpacing: 1.2,
    opacity:       0.6,
  },
});