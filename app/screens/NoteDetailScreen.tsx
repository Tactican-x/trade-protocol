import React, { useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Keyboard,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  Note,
  ChecklistItem,
  loadNotes,
  addNote,
  updateNote,
  deleteNote,
} from '../store/trades';
import { colors, font, spacing, radius } from '../theme';

// ─────────────────────────────────────────────────────────────────────────────
// Category config
// ─────────────────────────────────────────────────────────────────────────────

type NoteCategory = 'trading' | 'strategy' | 'psychology' | 'market' | 'other';

const CATEGORIES: {
  key: NoteCategory;
  label: string;
  icon: string;
  color: string;
}[] = [
  { key: 'trading',    label: 'Trading',    icon: '📊', color: colors.blue   },
  { key: 'strategy',   label: 'Strategy',   icon: '🎯', color: colors.green  },
  { key: 'psychology', label: 'Psychology', icon: '🧠', color: colors.amber  },
  { key: 'market',     label: 'Market',     icon: '🌍', color: colors.red    },
  { key: 'other',      label: 'Other',      icon: '📌', color: colors.purple },
];

// ─────────────────────────────────────────────────────────────────────────────
// Checklist Item Component
// ─────────────────────────────────────────────────────────────────────────────

function ChecklistItemRow({
  item,
  onToggle,
  onChangeText,
  onDelete,
  onFocus,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onChangeText: (text: string) => void;
  onDelete: () => void;
  onFocus: () => void;
}) {
  return (
    <View style={checkStyles.row}>
      <TouchableOpacity
        style={[
          checkStyles.checkbox,
          item.checked && checkStyles.checkboxChecked,
        ]}
        onPress={() => {
          onToggle();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        activeOpacity={0.7}
      >
        {item.checked && (
          <Ionicons name="checkmark" size={12} color={colors.bg} />
        )}
      </TouchableOpacity>

      <TextInput
        style={[
          checkStyles.input,
          item.checked && checkStyles.inputChecked,
        ]}
        value={item.text}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder="Type a task..."
        placeholderTextColor={colors.muted}
        maxLength={200}
      />

      <TouchableOpacity
        style={checkStyles.deleteBtn}
        onPress={onDelete}
        activeOpacity={0.7}
      >
        <Ionicons name="close-circle" size={18} color={colors.muted} />
      </TouchableOpacity>
    </View>
  );
}

const checkStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginBottom:  spacing.xs,
  },
  checkbox: {
    width:           22,
    height:          22,
    borderRadius:    6,
    borderWidth:     2,
    borderColor:     colors.border,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: colors.green,
    borderColor:     colors.green,
  },
  input: {
    flex:              1,
    fontSize:          13,
    color:             colors.text,
    paddingVertical:   6,
    paddingHorizontal: spacing.sm,
    backgroundColor:   colors.surface,
    borderRadius:      radius.sm,
    borderWidth:       0.5,
    borderColor:       colors.border,
    fontFamily:        font.mono,
  },
  inputChecked: {
    textDecorationLine: 'line-through',
    color:              colors.muted,
  },
  deleteBtn: {
    padding: 2,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function NoteDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  // Form state
  const [title, setTitle]                 = useState('');
  const [content, setContent]             = useState('');
  const [checklist, setChecklist]         = useState<ChecklistItem[]>([]);
  const [category, setCategory]           = useState<NoteCategory>('trading');
  const [pinned, setPinned]               = useState(false);
  const [saving, setSaving]               = useState(false);
  const [existingNote, setExisting]       = useState<Note | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);

  const scrollRef     = useRef<ScrollView>(null);
  const checklistRef  = useRef<View>(null);

  // ── Load existing note ──────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (!isNew) {
        (async () => {
          const notes = await loadNotes();
          const found = notes.find((n) => n.id === Number(id));
          if (found) {
            setExisting(found);
            setTitle(found.title);
            setContent(found.content);
            setChecklist(found.checklist);
            setCategory(found.category);
            setPinned(found.pinned);
            if (found.checklist.length > 0) {
              setShowChecklist(true);
            }
          }
        })();
      }
    }, [id])
  );

  // ── Scroll to checklist bottom ──────────────────────────────────────────
  const scrollToChecklist = () => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  // ── Checklist operations ────────────────────────────────────────────────
  const addChecklistItem = () => {
    const newItem: ChecklistItem = {
      id:      Date.now(),
      text:    '',
      checked: false,
    };
    setChecklist((prev) => [...prev, newItem]);
    setShowChecklist(true);
    scrollToChecklist();
  };

  const toggleCheckItem = (itemId: number) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const updateCheckItemText = (itemId: number, text: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, text } : item
      )
    );
  };

  const deleteCheckItem = (itemId: number) => {
    setChecklist((prev) => prev.filter((item) => item.id !== itemId));
  };

  const clearCompletedItems = () => {
    const completed = checklist.filter((c) => c.checked).length;
    if (completed === 0) return;
    Alert.alert(
      'Clear Completed',
      `Remove ${completed} completed ${completed === 1 ? 'item' : 'items'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: () => {
            setChecklist((prev) => prev.filter((item) => !item.checked));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          },
        },
      ]
    );
  };

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Title Required', 'Please enter a title for your note.');
      return;
    }

    setSaving(true);

    try {
      const cleanChecklist = checklist.filter(
        (item) => item.text.trim().length > 0
      );

      if (isNew) {
        await addNote({
          title:     title.trim(),
          content:   content.trim(),
          checklist: cleanChecklist,
          category,
          pinned,
        });
      } else if (existingNote) {
        await updateNote({
          ...existingNote,
          title:     title.trim(),
          content:   content.trim(),
          checklist: cleanChecklist,
          category,
          pinned,
        });
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = () => {
    if (!existingNote) return;
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteNote(existingNote.id);
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Warning
            );
            router.back();
          },
        },
      ]
    );
  };

  // ── Toggle pin ──────────────────────────────────────────────────────────
  const handleTogglePin = () => {
    setPinned((prev) => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Checklist stats ─────────────────────────────────────────────────────
  const checklistTotal    = checklist.length;
  const checklistDone     = checklist.filter((c) => c.checked).length;
  const checklistProgress =
    checklistTotal > 0
      ? Math.round((checklistDone / checklistTotal) * 100)
      : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* ── Pin toggle + Date ─────────────────────────────────────── */}
          <View style={styles.topRow}>
            <TouchableOpacity
              style={[
                styles.pinButton,
                pinned && styles.pinButtonActive,
              ]}
              onPress={handleTogglePin}
              activeOpacity={0.7}
            >
              <Ionicons
                name={pinned ? 'pin' : 'pin-outline'}
                size={16}
                color={pinned ? colors.green : colors.muted}
              />
              <Text
                style={[
                  styles.pinText,
                  pinned && { color: colors.green },
                ]}
              >
                {pinned ? 'Pinned' : 'Pin'}
              </Text>
            </TouchableOpacity>

            {existingNote && (
              <Text style={styles.dateLabel}>
                Created: {existingNote.dateStr}
              </Text>
            )}
          </View>

          {/* ── Title ────────────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>TITLE</Text>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Note title..."
              placeholderTextColor={colors.muted}
              maxLength={100}
            />
          </View>

          {/* ── Category ─────────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CATEGORY</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => {
                const isActive = category === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[
                      styles.categoryChip,
                      isActive && {
                        backgroundColor: cat.color + '22',
                        borderColor:     cat.color,
                      },
                    ]}
                    onPress={() => {
                      setCategory(cat.key);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.categoryIcon}>{cat.icon}</Text>
                    <Text
                      style={[
                        styles.categoryText,
                        isActive && { color: cat.color },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Content ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>NOTES</Text>
            <TextInput
              style={[styles.input, styles.contentInput]}
              value={content}
              onChangeText={setContent}
              placeholder="Write your thoughts, ideas, observations..."
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
              maxLength={50000}
            />
            <Text style={styles.charCount}>{content.length}/50000</Text>
          </View>

          {/* ── Checklist ─────────────────────────────────────────────── */}
          <View style={styles.section} ref={checklistRef}>
            <View style={styles.checklistHeader}>
              <Text style={styles.sectionLabel}>✅ CHECKLIST</Text>

              {checklistTotal > 0 && (
                <View style={styles.checklistStats}>
                  <Text style={styles.checklistStatsText}>
                    {checklistDone}/{checklistTotal}
                  </Text>
                  <View style={styles.checkProgressBg}>
                    <View
                      style={[
                        styles.checkProgressFill,
                        {
                          width: `${checklistProgress}%` as any,
                          backgroundColor:
                            checklistDone === checklistTotal
                              ? colors.green
                              : colors.blue,
                        },
                      ]}
                    />
                  </View>
                </View>
              )}
            </View>

            {/* Checklist items */}
            {showChecklist && checklist.length > 0 && (
              <View style={styles.checklistContainer}>
                {checklist.map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    onToggle={() => toggleCheckItem(item.id)}
                    onChangeText={(text) =>
                      updateCheckItemText(item.id, text)
                    }
                    onDelete={() => deleteCheckItem(item.id)}
                    onFocus={scrollToChecklist}
                  />
                ))}
              </View>
            )}

            {/* Checklist actions */}
            <View style={styles.checklistActions}>
              <TouchableOpacity
                style={styles.addCheckBtn}
                onPress={addChecklistItem}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={18}
                  color={colors.green}
                />
                <Text style={styles.addCheckText}>Add Item</Text>
              </TouchableOpacity>

              {checklistDone > 0 && (
                <TouchableOpacity
                  style={styles.clearCheckBtn}
                  onPress={clearCompletedItems}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="trash-outline"
                    size={14}
                    color={colors.muted}
                  />
                  <Text style={styles.clearCheckText}>
                    Clear {checklistDone} done
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* All done banner */}
            {checklistTotal > 0 && checklistDone === checklistTotal && (
              <View style={styles.allDoneCard}>
                <Text style={styles.allDoneEmoji}>🎉</Text>
                <Text style={styles.allDoneText}>All tasks completed!</Text>
              </View>
            )}
          </View>

          {/* ── Save Button ──────────────────────────────────────────── */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              (!title.trim() || saving) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!title.trim() || saving}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isNew ? 'cloud-upload' : 'checkmark-circle'}
              size={20}
              color={colors.bg}
            />
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : isNew ? 'Save Note' : 'Update Note'}
            </Text>
          </TouchableOpacity>

          {/* ── Delete Button ─────────────────────────────────────────── */}
          {!isNew && existingNote && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color={colors.red} />
              <Text style={styles.deleteButtonText}>Delete Note</Text>
            </TouchableOpacity>
          )}

          {/* Extra padding for keyboard */}
          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingBottom: 40,
  },

  // ── Top row ──
  topRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   spacing.md,
  },
  pinButton: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    paddingHorizontal: spacing.md,
    paddingVertical:   6,
    borderRadius:      radius.md,
    borderWidth:       0.5,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
  },
  pinButtonActive: {
    backgroundColor: colors.green + '18',
    borderColor:     colors.green + '55',
  },
  pinText: {
    fontSize:   12,
    fontWeight: '600',
    color:      colors.muted,
  },
  dateLabel: {
    fontSize:   10,
    color:      colors.muted,
    fontFamily: font.mono,
  },

  // ── Sections ──
  section: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize:      10,
    fontWeight:    '700',
    color:         colors.muted,
    fontFamily:    font.mono,
    letterSpacing: 1.5,
    marginBottom:  spacing.sm,
  },

  // ── Title ──
  titleInput: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    padding:         spacing.md,
    fontSize:        16,
    fontWeight:      '700',
    color:           colors.text,
  },

  // ── Category ──
  categoryGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
  },
  categoryChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.pill,
    borderWidth:       0.5,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
  },
  categoryIcon: { fontSize: 14 },
  categoryText: {
    fontSize:   12,
    fontWeight: '600',
    color:      colors.muted,
  },

  // ── Content input ──
  input: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    padding:         spacing.md,
    fontSize:        14,
    color:           colors.text,
    fontFamily:      font.mono,
  },
  contentInput: {
    minHeight: 120,
    maxHeight: 250,
  },
  charCount: {
    fontSize:   10,
    color:      colors.muted,
    fontFamily: font.mono,
    textAlign:  'right',
    marginTop:  4,
  },

  // ── Checklist ──
  checklistHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   spacing.xs,
  },
  checklistStats: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
  },
  checklistStatsText: {
    fontSize:   11,
    fontWeight: '700',
    color:      colors.muted,
    fontFamily: font.mono,
  },
  checkProgressBg: {
    width:           60,
    height:          4,
    backgroundColor: colors.border,
    borderRadius:    2,
    overflow:        'hidden',
  },
  checkProgressFill: {
    height:       4,
    borderRadius: 2,
  },
  checklistContainer: {
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    padding:         spacing.md,
    marginBottom:    spacing.sm,
  },
  checklistActions: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.md,
  },
  addCheckBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius:      radius.sm,
    backgroundColor:   colors.green + '12',
    borderWidth:       0.5,
    borderColor:       colors.green + '33',
  },
  addCheckText: {
    fontSize:   12,
    fontWeight: '600',
    color:      colors.green,
  },
  clearCheckBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius:      radius.sm,
    backgroundColor:   colors.surface,
    borderWidth:       0.5,
    borderColor:       colors.border,
  },
  clearCheckText: {
    fontSize:   11,
    color:      colors.muted,
    fontFamily: font.mono,
  },
  allDoneCard: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.sm,
    backgroundColor: colors.green + '12',
    borderWidth:     0.5,
    borderColor:     colors.green + '33',
    borderRadius:    radius.sm,
    padding:         spacing.md,
    marginTop:       spacing.sm,
  },
  allDoneEmoji: { fontSize: 18 },
  allDoneText: {
    fontSize:   12,
    fontWeight: '700',
    color:      colors.green,
    fontFamily: font.mono,
  },

  // ── Save button ──
  saveButton: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing.sm,
    backgroundColor: colors.green,
    borderRadius:    radius.lg,
    padding:         spacing.lg,
    marginTop:       spacing.sm,
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: {
    fontSize:      15,
    fontWeight:    '800',
    color:         colors.bg,
    letterSpacing: 0.5,
  },

  // ── Delete button ──
  deleteButton: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    paddingVertical: spacing.md,
    marginTop:      spacing.md,
  },
  deleteButtonText: {
    fontSize:   13,
    fontWeight: '600',
    color:      colors.red,
  },
});