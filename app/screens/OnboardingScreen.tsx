import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { colors, font, spacing, radius } from '../theme';
import { useAppContext } from '../context/AppContext';

const { width: SCREEN_W } = Dimensions.get('window');
const ONBOARDING_KEY = 'tp_onboarding_done';

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(ONBOARDING_KEY);
    return val === 'true';
  } catch { return false; }
}

export async function markOnboardingDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  } catch {}
}

const SLIDES = [
  {
    icon: 'shield-checkmark',
    color: '#00d68f',
    title: 'Trade with Discipline',
    subtitle: 'TRADING PSYCHOLOGY OS',
    desc: 'Trade Protocol is your complete trading psychology journal. Track every trade, review your mindset, and build unshakeable discipline.',
    highlights: [
      { icon: 'checkmark-circle', text: '27-rule psychology checklist' },
      { icon: 'analytics',        text: 'Performance analytics' },
      { icon: 'book',             text: 'Daily mental journal' },
    ],
  },
  {
    icon: 'list-circle',
    color: '#4fc3f7',
    title: '4-Phase Entry Ritual',
    subtitle: 'BEFORE · DURING · AFTER · DETAILS',
    desc: 'Every trade starts with a ritual. Complete all 4 phases to ensure you are entering with clarity, not emotion.',
    highlights: [
      { icon: 'sunny',   text: 'Before: Market check + mental state' },
      { icon: 'flash',   text: 'During: Execution discipline' },
      { icon: 'refresh', text: 'After: Review + lessons learned' },
    ],
  },
  {
    icon: 'bar-chart',
    color: '#a78bfa',
    title: 'Track Your Progress',
    subtitle: 'DATA-DRIVEN IMPROVEMENT',
    desc: 'See your discipline score, win rate, P&L trends, and session breakdowns. Know exactly which strategy and session makes you money.',
    highlights: [
      { icon: 'trending-up',      text: 'Discipline trend over time' },
      { icon: 'podium',           text: 'Best/worst trade tracking' },
      { icon: 'stats-chart',      text: 'Strategy & session analytics' },
    ],
  },
  {
    icon: 'flag',
    color: '#ffd166',
    title: 'Set Goals. Stay Accountable.',
    subtitle: 'GOALS & TARGETS',
    desc: 'Set monthly P&L targets, win rate goals, and discipline targets. Track your progress every day and celebrate when you hit them.',
    highlights: [
      { icon: 'cash',              text: 'Monthly P&L goals' },
      { icon: 'trophy',            text: 'Win rate & discipline targets' },
      { icon: 'calculator',        text: 'Built-in risk calculator' },
    ],
  },
  {
    icon: 'rocket',
    color: '#00d68f',
    title: "You're Ready!",
    subtitle: 'START YOUR JOURNEY',
    desc: "Your trading psychology transformation starts now. Log your first trade, follow the ritual, and watch your discipline improve.",
    highlights: [
      { icon: 'add-circle',   text: 'Log your first trade' },
      { icon: 'book',         text: 'Start your daily journal' },
      { icon: 'shield',       text: 'Follow the discipline protocol' },
    ],
  },
];

export default function OnboardingScreen() {
  const { accent } = useAppContext();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const goNext = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentIndex < SLIDES.length - 1) {
      const next = currentIndex + 1;
      scrollRef.current?.scrollTo({ x: next * SCREEN_W, animated: true });
      setCurrentIndex(next);
    } else {
      await markOnboardingDone();
      router.replace('/(tabs)');
    }
  };

  const skip = async () => {
    await markOnboardingDone();
    router.replace('/(tabs)');
  };

  const slide = SLIDES[currentIndex];

  return (
    <SafeAreaView style={styles.safe}>
      {/* Skip button */}
      <TouchableOpacity onPress={skip} style={styles.skipBtn}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={styles.slider}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={[styles.slide, { width: SCREEN_W }]}>
            {/* Icon */}
            <View style={[styles.iconBg, { backgroundColor: s.color + '18' }]}>
              <Ionicons name={s.icon as any} size={56} color={s.color} />
            </View>

            {/* Badge */}
            <View style={[styles.badge, { backgroundColor: s.color + '22', borderColor: s.color + '55' }]}>
              <Text style={[styles.badgeText, { color: s.color }]}>{s.subtitle}</Text>
            </View>

            {/* Title */}
            <Text style={styles.title}>{s.title}</Text>

            {/* Desc */}
            <Text style={styles.desc}>{s.desc}</Text>

            {/* Highlights */}
            <View style={styles.highlights}>
              {s.highlights.map((h, hi) => (
                <View key={hi} style={styles.highlightRow}>
                  <View style={[styles.highlightIcon, { backgroundColor: s.color + '18' }]}>
                    <Ionicons name={h.icon as any} size={16} color={s.color} />
                  </View>
                  <Text style={styles.highlightText}>{h.text}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentIndex && {
                  backgroundColor: slide.color,
                  width: 20,
                },
              ]}
            />
          ))}
        </View>

        {/* Next/Start Button */}
        <TouchableOpacity
          onPress={goNext}
          style={[styles.nextBtn, { backgroundColor: slide.color }]}
          activeOpacity={0.8}
        >
          <Text style={styles.nextBtnText}>
            {currentIndex === SLIDES.length - 1 ? "Let's Start" : 'Continue'}
          </Text>
          <Ionicons
            name={currentIndex === SLIDES.length - 1 ? 'rocket' : 'arrow-forward'}
            size={18}
            color={colors.bg}
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  skipBtn: { position: 'absolute', top: 60, right: spacing.lg, zIndex: 10 },
  skipText: { fontFamily: font.mono, fontSize: 12, color: colors.muted },

  slider: { flex: 1 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

  iconBg: { width: 120, height: 120, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },

  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, marginBottom: spacing.md },
  badgeText: { fontFamily: font.mono, fontSize: 9, letterSpacing: 1.5 },

  title: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: spacing.md, letterSpacing: 0.3 },
  desc: { fontFamily: font.mono, fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },

  highlights: { width: '100%', gap: spacing.sm },
  highlightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  highlightIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  highlightText: { fontFamily: font.mono, fontSize: 12, color: colors.text, flex: 1 },

  footer: { padding: spacing.lg, gap: spacing.md },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: colors.border2 },

  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.lg, paddingVertical: 16 },
  nextBtnText: { fontFamily: font.mono, fontSize: 15, fontWeight: '800', color: colors.bg },
});