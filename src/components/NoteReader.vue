<script setup lang="ts">
import { ref, watch } from 'vue';
import type { NoteDto } from '../../shared/types';
import MarkdownRenderer from './MarkdownRenderer.vue';

const props = defineProps<{
  topicId: string;
  topicTitle?: string;
}>();

defineEmits<{
  (e: 'practiceQuestion', questionId: string): void;
  (e: 'startPractice'): void;
}>();

const notes = ref<NoteDto[]>([]);
const includeDescendants = ref(false);
const loading = ref(false);
const error = ref('');

async function fetchNotes() {
  if (!props.topicId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch(
      `/api/v1/topics/${props.topicId}/notes?includeDescendants=${includeDescendants.value}`,
    );
    if (!res.ok) throw new Error('无法加载知识点笔记');
    notes.value = await res.json();
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.topicId, includeDescendants.value],
  () => {
    fetchNotes();
  },
  { immediate: true },
);
</script>

<template>
  <div class="note-reader max-w-4xl mx-auto py-6 px-4">
    <div class="flex items-center justify-between pb-4 border-b border-ctp-surface0 mb-6">
      <div>
        <span class="text-xs font-semibold text-ctp-subtext1 uppercase tracking-wider"
          >知识点精讲</span
        >
        <h2 class="text-2xl font-bold text-ctp-text mt-1">{{ topicTitle || '知识点笔记' }}</h2>
      </div>
      <div class="flex items-center gap-4">
        <label class="flex items-center gap-2 text-sm text-ctp-subtext0 cursor-pointer">
          <input v-model="includeDescendants" type="checkbox" class="accent-ctp-mauve" />
          <span>包含子章节</span>
        </label>
        <button
          class="px-3.5 py-1.5 bg-ctp-mauve hover:opacity-90 text-ctp-crust text-sm font-bold rounded-lg shadow-sm transition-opacity cursor-pointer"
          @click="$emit('startPractice')"
        >
          练习本节习题 ↗
        </button>
      </div>
    </div>

    <div v-if="loading" class="py-12 text-center text-ctp-subtext0">
      <div class="animate-pulse">正在整理知识点笔记…</div>
    </div>

    <div
      v-else-if="error"
      class="p-4 bg-ctp-red/10 border border-ctp-red/30 text-ctp-red rounded-lg"
    >
      {{ error }}
    </div>

    <div v-else-if="notes.length === 0" class="py-16 text-center">
      <p class="text-lg text-ctp-subtext1 mb-2">当前节点暂无独立笔记。</p>
      <p class="text-sm text-ctp-subtext0 mb-6">
        你可以勾选上方“包含子章节”查看下级笔记，或直接进入习题练习。
      </p>
      <button
        class="px-4 py-2 bg-ctp-mauve text-ctp-crust rounded-lg text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
        @click="$emit('startPractice')"
      >
        直接练习该章节题目
      </button>
    </div>

    <div v-else class="space-y-8">
      <article
        v-for="note in notes"
        :key="note.id"
        class="bg-ctp-surface0 border border-ctp-surface1 rounded-xl p-6 shadow-xs"
      >
        <h3 class="text-xl font-bold text-ctp-text mb-4 pb-2 border-b border-ctp-surface1">
          {{ note.title }}
        </h3>
        <MarkdownRenderer
          :content="note.bodyMd"
          @select-question="(qId) => $emit('practiceQuestion', qId)"
        />
      </article>
    </div>
  </div>
</template>
