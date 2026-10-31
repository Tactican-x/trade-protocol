import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, font, spacing, radius } from '../theme';
import { useAppContext } from '../context/AppContext';

// ── PIN Dot ───────────────────────────────────────────────────────────────────
function PinDot({
  filled,
  color,
  shake,
}: {
  filled: boolean;
  color: string;
  shake: Animated.Value;
}) {
  return (
    <Animated.View
      style={[
        dotStyles.dot,
        filled && { backgroundColor: color, borderColor: color },
        { transform: [{ translateX: shake }] },
      ]}
    />
  );
}
const dotStyles = StyleSheet.create({
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border2,
    backgroundColor: 'transparent',
    margin: 10,
  },
});

// ── Keypad Button ─────────────────────────────────────────────────────────────
function KeyBtn({
  label,
  onPress,
  sub,
  transparent,
}: {
  label: string;
  onPress: () => void;
  sub?: string;
  transparent?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        kbStyles.btn,
        transparent && {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
        },
      ]}
    >
      <Text style={kbStyles.label}>{label}</Text>
      {sub && <Text style={kbStyles.sub}>{sub}</Text>}
    </TouchableOpacity>
  );
}
const kbStyles = StyleSheet.create({
  btn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  label: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    fontFamily: font.mono,
  },
  sub: {
    fontFamily: font.mono,
    fontSize: 8,
    color: colors.muted,
    letterSpacing: 1,
    marginTop: 1,
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// ── PIN LOCK SCREEN ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
interface PinLockScreenProps {
  onUnlock: () => void;
}

export function PinLockScreen({ onUnlock }: PinLockScreenProps) {
  const { accent, pin } = useAppContext();
  const [entered, setEntered] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(0);
  const [status, setStatus] = useState<'idle' | 'error' | 'success'>('idle');

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Fade in on mount ──────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  // ── Lockout countdown ─────────────────────────────────────────────────
  useEffect(() => {
    if (!locked || lockCountdown <= 0) return;
    const timer = setInterval(() => {
      setLockCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setLocked(false);
          setAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [locked, lockCountdown]);

  // ── Shake animation ───────────────────────────────────────────────────
  const handleShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  // ── Handle key press ──────────────────────────────────────────────────
  const handleKey = async (key: string) => {
    if (locked || entered.length >= 4 || status === 'success') return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newPin = entered + key;
    setEntered(newPin);
    if (newPin.length === 4) {
      setTimeout(() => checkPin(newPin), 150);
    }
  };

  const handleBack = async () => {
    if (locked || status === 'success') return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEntered((p) => p.slice(0, -1));
  };

  // ── Check entered PIN ─────────────────────────────────────────────────
  const checkPin = async (enteredPin: string) => {
    if (enteredPin === pin) {
      // ✅ Correct
      setStatus('success');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(onUnlock, 400);
    } else {
      // ❌ Wrong
      setStatus('error');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      handleShake();
      Vibration.vibrate(400);

      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setEntered('');

      if (newAttempts >= 5) {
        setLocked(true);
        setLockCountdown(30);
        setStatus('idle');
      } else {
        setTimeout(() => setStatus('idle'), 800);
      }
    }
  };

  const KEY_SUBS: Record<string, string> = {
    '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL',
    '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ',
  };

  const dotColor =
    status === 'error'
      ? colors.red
      : status === 'success'
      ? colors.green
      : accent;

  const iconName =
    status === 'success'
      ? 'checkmark-circle'
      : status === 'error'
      ? 'close-circle'
      : locked
      ? 'lock-closed'
      : 'lock-closed';

  const iconColor =
    status === 'error'
      ? colors.red
      : status === 'success'
      ? colors.green
      : accent;

  const subtitleText = locked
    ? `Too many attempts. Try again in ${lockCountdown}s`
    : status === 'error'
    ? `Wrong PIN. ${5 - attempts} attempt${5 - attempts !== 1 ? 's' : ''} remaining`
    : status === 'success'
    ? 'Unlocking...'
    : 'Enter your PIN to continue';

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={[styles.iconBg, { backgroundColor: iconColor + '18' }]}>
            <Ionicons name={iconName as any} size={40} color={iconColor} />
          </View>
          <Text style={styles.appName}>Trade Protocol</Text>
          <Text style={[styles.subtitle, status === 'error' && { color: colors.red }]}>
            {subtitleText}
          </Text>
        </View>

        {/* ── PIN Dots ─────────────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.dotsRow,
            { transform: [{ translateX: shakeAnim }] },
          ]}
        >
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                dotStyles.dot,
                i < entered.length && {
                  backgroundColor: dotColor,
                  borderColor: dotColor,
                },
              ]}
            />
          ))}
        </Animated.View>

        {/* ── Failed attempts warning ───────────────────────────────────── */}
        {attempts > 0 && attempts < 5 && !locked && status === 'idle' && (
          <View style={styles.attemptsWarn}>
            <Ionicons name="warning" size={12} color={colors.amber} />
            <Text style={styles.attemptsText}>
              {attempts} failed attempt{attempts !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* ── Locked state ─────────────────────────────────────────────── */}
        {locked && (
          <View style={styles.lockedCard}>
            <Ionicons name="time" size={16} color={colors.red} />
            <Text style={styles.lockedText}>
              Too many failed attempts.{'\n'}
              Locked for {lockCountdown} seconds.
            </Text>
          </View>
        )}

        {/* ── Keypad ───────────────────────────────────────────────────── */}
        <View style={[styles.keypad, (locked || status === 'success') && { opacity: 0.3 }]}>
          {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']].map((row, ri) => (
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
          <View style={styles.keyRow}>
            {/* Empty left slot */}
            <View
              style={[
                kbStyles.btn,
                { backgroundColor: 'transparent', borderColor: 'transparent' },
              ]}
            />
            <KeyBtn label="0" onPress={() => handleKey('0')} />
            <TouchableOpacity
              onPress={handleBack}
              style={[
                kbStyles.btn,
                { backgroundColor: 'transparent', borderColor: 'transparent' },
              ]}
              activeOpacity={0.7}
            >
              <Ionicons name="backspace" size={26} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Footer badge ─────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <View style={[styles.footerBadge, { borderColor: accent + '33' }]}>
            <Text style={[styles.footerText, { color: accent }]}>
              TRADING PSYCHOLOGY OS
            </Text>
          </View>
        </View>

      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 9999,
  },
  safe: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    padding: spacing.lg,
  },

  header: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  appName: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },

  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  attemptsWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attemptsText: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.amber,
  },

  lockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.red + '11',
    borderWidth: 0.5,
    borderColor: colors.red + '44',
    borderRadius: radius.lg,
    padding: spacing.md,
    maxWidth: 280,
  },
  lockedText: {
    flex: 1,
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.red,
    lineHeight: 17,
  },

  keypad: { gap: spacing.sm },
  keyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },

  footer: { alignItems: 'center' },
  footerBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  footerText: {
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: 2,
  },
});