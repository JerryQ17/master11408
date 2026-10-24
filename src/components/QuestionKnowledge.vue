<script setup lang="ts">
import { ref, watch } from 'vue';
import type { NoteSummaryDto } from '../../shared/types';
import { fetchJson } from '../app/knowledge';
import LocalGraph from './LocalGraph.vue';

const props = defineProps<{ questionId: string }>();
defineEmits<{ openNote: [id: string] }>();
const notes = ref<NoteSummaryDto[]>([]);
const error = ref('');
watch(
  () => props.questionId,
  async (id, _, onCleanup) => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    notes.value = [];
    error.value = '';
    try {
      const result = await fetchJson<NoteSummaryDto[]>(
        `/api/v1/questions/${encodeURIComponent(id)}/notes`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) notes.value = result;
    } catch (err) {
      if (!controller.signal.aborted) error.value = (err as Error).message;
    }
  },
  { immediate: true },
);
</script>

<template>
  <section class="space-y-4" aria-label="本题考点">
    <h3 class="font-semibold text-sm">本题考点</h3>
    <p v-if="error" role="alert" class="text-sm text-ctp-red">{{ error }}</p>
    <p v-else-if="!notes.length" class="text-sm text-ctp-subtext0">暂无关联考点笔记</p>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="note in notes"
        :key="note.id"
        class="px-3 py-2 rounded-lg border border-ctp-mauve/30 bg-ctp-mauve/10 text-ctp-mauve text-sm cursor-pointer"
        @click="$emit('openNote', note.id)"
      >
        {{ note.title }}
      </button>
    </div>
    <LocalGraph
      :question-id="questionId"
      @select="$event.kind === 'note' && $emit('openNote', $event.entityId)"
    />
  </section>
</template>
