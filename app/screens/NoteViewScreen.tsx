import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  Note,
  loadNotes,
  deleteNote,
  toggleNotePin,
  toggleChecklistItem,
} from '../store/trades';
import { colors, font, spacing, radius } from '../theme';
import { useAppContext } from '../context/AppContext';

// ─────────────────────────────────────────────────────────────────────────────
// Category config
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  trading:    { icon: '📊', color: colors.blue,   label: 'Trading' },
  strategy:   { icon: '🎯', color: colors.green,  label: 'Strategy' },
  psychology: { icon: '🧠', color: colors.amber,  label: 'Psychology' },
  market:     { icon: '🌍', color: colors.red,    label: 'Market' },
  other:      { icon: '📌', color: colors.purple, label: 'Other' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function NoteViewScreen() {
  const router = useRouter();
  const { accent } = useAppContext();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [note, setNote] = useState<Note | null>(null);

  // ── Load note ───────────────────────────────────────────────────────────
  const loadNote = useCallback(async () => {
    const notes = await loadNotes();
    const found = notes.find((n) => n.id === Number(id));
    if (found) setNote(found);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadNote();
    }, [loadNote])
  );

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleTogglePin = async () => {
    if (!note) return;
    await toggleNotePin(note.id);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadNote();
  };

  const handleToggleCheck = async (itemId: number) => {
    if (!note) return;
    await toggleChecklistItem(note.id, itemId);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadNote();
  };

  const handleEdit = () => {
    if (!note) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/screens/NoteDetailScreen',
      params: { id: note.id },
    });
  };

  const handleDelete = () => {
    if (!note) return;
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteNote(note.id);
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Warning
            );
            router.back();
          },
        },
      ]
    );
  };

  // ── Loading / not found ─────────────────────────────────────────────────
  if (!note) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📝</Text>
          <Text style={styles.emptyTitle}>Note not found</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.emptyBack, { color: accent }]}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────
  const cat             = CATEGORY_CONFIG[note.category] ?? CATEGORY_CONFIG.other;
  const checklistTotal  = note.checklist.length;
  const checklistDone   = note.checklist.filter((c) => c.checked).length;
  const checklistPct    = checklistTotal > 0
    ? Math.round((checklistDone / checklistTotal) * 100)
    : 0;

  const updatedDate = new Date(note.updatedAt).toLocaleDateString('en-GB', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
    hour:  '2-digit',
    minute: '2-digit',
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header card ────────────────────────────────────────────── */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            {note.pinned && (
              <View style={styles.pinnedBadge}>
                <Ionicons name="pin" size={10} color={colors.green} />
                <Text style={styles.pinnedText}>PINNED</Text>
              </View>
            )}
            <View
              style={[
                styles.catBadge,
                {
                  backgroundColor: cat.color + '22',
                  borderColor:     cat.color + '44',
                },
              ]}
            >
              <Text style={styles.catIcon}>{cat.icon}</Text>
              <Text style={[styles.catLabel, { color: cat.color }]}>
                {cat.label.toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{note.title}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Created: {note.dateStr}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>Updated: {updatedDate}</Text>
          </View>
        </View>

        {/* ── Action buttons ─────────────────────────────────────────── */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: accent }]}
            onPress={handleEdit}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={16} color={colors.bg} />
            <Text style={styles.actionBtnText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.actionBtnOutline,
              note.pinned && {
                backgroundColor: colors.green + '18',
                borderColor:     colors.green + '55',
              },
            ]}
            onPress={handleTogglePin}
            activeOpacity={0.7}
          >
            <Ionicons
              name={note.pinned ? 'pin' : 'pin-outline'}
              size={16}
              color={note.pinned ? colors.green : colors.muted}
            />
            <Text
              style={[
                styles.actionBtnOutlineText,
                note.pinned && { color: colors.green },
              ]}
            >
              {note.pinned ? 'Pinned' : 'Pin'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnOutline]}
            onPress={handleDelete}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={16} color={colors.red} />
          </TouchableOpacity>
        </View>

        {/* ── Content ────────────────────────────────────────────────── */}
        {note.content.length > 0 && (
          <View style={styles.contentCard}>
            <Text style={styles.contentLabel}>NOTES</Text>
            <Text style={styles.contentText}>{note.content}</Text>
          </View>
        )}

        {/* ── Checklist ──────────────────────────────────────────────── */}
        {checklistTotal > 0 && (
          <View style={styles.checklistCard}>
            <View style={styles.checklistHeader}>
              <Text style={styles.contentLabel}>✅ CHECKLIST</Text>
              <View style={styles.checklistProgress}>
                <Text style={styles.checklistProgressText}>
                  {checklistDone}/{checklistTotal}
                </Text>
                <View style={styles.checkBarBg}>
                  <View
                    style={[
                      styles.checkBarFill,
                      {
                        width: `${checklistPct}%` as any,
                        backgroundColor:
                          checklistDone === checklistTotal
                            ? colors.green
                            : colors.blue,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.checklistPct,
                    {
                      color:
                        checklistDone === checklistTotal
                          ? colors.green
                          : colors.blue,
                    },
                  ]}
                >
                  {checklistPct}%
                </Text>
              </View>
            </View>

            {note.checklist.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.checkItem}
                onPress={() => handleToggleCheck(item.id)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.checkbox,
                    item.checked && styles.checkboxChecked,
                  ]}
                >
                  {item.checked && (
                    <Ionicons name="checkmark" size={12} color={colors.bg} />
                  )}
                </View>
                <Text
                  style={[
                    styles.checkItemText,
                    item.checked && styles.checkItemTextDone,
                  ]}
                >
                  {item.text}
                </Text>
              </TouchableOpacity>
            ))}

            {checklistDone === checklistTotal && (
              <View style={styles.allDoneCard}>
                <Text style={styles.allDoneEmoji}>🎉</Text>
                <Text style={styles.allDoneText}>All tasks completed!</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Empty content ──────────────────────────────────────────── */}
        {note.content.length === 0 && checklistTotal === 0 && (
          <View style={styles.noContentCard}>
            <Text style={styles.noContentIcon}>📄</Text>
            <Text style={styles.noContentText}>
              This note is empty. Tap Edit to add content.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg,
  },
  scrollView:    { flex: 1 },
  scrollContent: {
    padding:       spacing.lg,
    paddingBottom: 100,
  },

  // ── Header card ──
  headerCard: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.lg,
    marginBottom:    spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginBottom:  spacing.md,
  },
  pinnedBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               3,
    backgroundColor:   colors.green + '18',
    borderWidth:       0.5,
    borderColor:       colors.green + '44',
    borderRadius:      radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
  },
  pinnedText: {
    fontSize:      8,
    fontWeight:    '700',
    color:         colors.green,
    fontFamily:    font.mono,
    letterSpacing: 0.5,
  },
  catBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderRadius:      radius.pill,
    borderWidth:       0.5,
  },
  catIcon: { fontSize: 11 },
  catLabel: {
    fontSize:      8,
    fontWeight:    '700',
    fontFamily:    font.mono,
    letterSpacing: 0.5,
  },
  title: {
    fontSize:      22,
    fontWeight:    '800',
    color:         colors.text,
    letterSpacing: 0.3,
    marginBottom:  spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
    flexWrap:      'wrap',
  },
  metaText: {
    fontSize:   10,
    color:      colors.muted,
    fontFamily: font.mono,
  },
  metaDot: {
    fontSize: 10,
    color:    colors.muted,
  },

  // ── Action buttons ──
  actionsRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
    marginBottom:  spacing.md,
  },
  actionBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               6,
    paddingVertical:   spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius:      radius.md,
  },
  actionBtnText: {
    fontSize:   13,
    fontWeight: '700',
    color:      colors.bg,
  },
  actionBtnOutline: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
  },
  actionBtnOutlineText: {
    fontSize:   13,
    fontWeight: '600',
    color:      colors.muted,
  },

  // ── Content ──
  contentCard: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.lg,
    marginBottom:    spacing.md,
  },
  contentLabel: {
    fontSize:      9,
    fontWeight:    '700',
    color:         colors.muted,
    fontFamily:    font.mono,
    letterSpacing: 1.5,
    marginBottom:  spacing.md,
  },
  contentText: {
    fontSize:   14,
    color:      colors.text,
    lineHeight: 22,
  },

  // ── Checklist ──
  checklistCard: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.lg,
    marginBottom:    spacing.md,
  },
  checklistHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   spacing.md,
  },
  checklistProgress: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  checklistProgressText: {
    fontSize:   11,
    fontWeight: '700',
    color:      colors.muted,
    fontFamily: font.mono,
  },
  checkBarBg: {
    width:           50,
    height:          4,
    backgroundColor: colors.surface2,
    borderRadius:    2,
    overflow:        'hidden',
  },
  checkBarFill: {
    height:       4,
    borderRadius: 2,
  },
  checklistPct: {
    fontSize:   10,
    fontWeight: '700',
    fontFamily: font.mono,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  checkbox: {
    width:           22,
    height:          22,
    borderRadius:    6,
    borderWidth:     2,
    borderColor:     colors.border2,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: colors.surface2,
  },
  checkboxChecked: {
    backgroundColor: colors.green,
    borderColor:     colors.green,
  },
  checkItemText: {
    flex:     1,
    fontSize: 13,
    color:    colors.text,
  },
  checkItemTextDone: {
    textDecorationLine: 'line-through',
    color:              colors.muted,
  },
  allDoneCard: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    backgroundColor: colors.green + '12',
    borderWidth:     0.5,
    borderColor:     colors.green + '33',
    borderRadius:    radius.sm,
    padding:         spacing.md,
    marginTop:       spacing.md,
  },
  allDoneEmoji: { fontSize: 18 },
  allDoneText: {
    fontSize:   12,
    fontWeight: '700',
    color:      colors.green,
    fontFamily: font.mono,
  },

  // ── No content ──
  noContentCard: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.xl,
    alignItems:      'center',
    marginBottom:    spacing.md,
  },
  noContentIcon: {
    fontSize:     36,
    marginBottom: spacing.sm,
  },
  noContentText: {
    fontSize:   13,
    color:      colors.muted,
    textAlign:  'center',
    lineHeight: 20,
  },

  // ── Empty state ──
  emptyContainer: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    padding:        spacing.xl,
  },
  emptyIcon: {
    fontSize:     48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize:     16,
    fontWeight:   '700',
    color:        colors.text,
    marginBottom: spacing.sm,
  },
  emptyBack: {
    fontSize:   14,
    fontWeight: '600',
  },
});