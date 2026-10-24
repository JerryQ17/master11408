<script setup lang="ts">
import { ref, watch } from 'vue';
import type { KnowledgeGraphDto, GraphNodeDto } from '../../shared/types';
import { fetchJson } from '../app/knowledge';
import KnowledgeGraph from './KnowledgeGraph.vue';

const props = defineProps<{ noteId?: string; questionId?: string }>();
defineEmits<{ select: [node: GraphNodeDto] }>();
const graph = ref<KnowledgeGraphDto | null>(null);
const loading = ref(false);
const error = ref('');
watch(
  () => [props.noteId, props.questionId],
  async (_, __, onCleanup) => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    loading.value = true;
    graph.value = null;
    error.value = '';
    try {
      const query = new URLSearchParams(
        props.noteId ? { noteId: props.noteId } : { questionId: props.questionId! },
      );
      const result = await fetchJson<KnowledgeGraphDto>(`/api/v1/graph/local?${query}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) graph.value = result;
    } catch (err) {
      if (!controller.signal.aborted) error.value = (err as Error).message;
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <section aria-label="局部知识图谱" class="space-y-3">
    <h3 class="font-semibold text-sm">局部知识图谱</h3>
    <p v-if="loading" class="text-sm text-ctp-subtext0">正在加载关联…</p>
    <p v-else-if="error" role="alert" class="text-sm text-ctp-red">{{ error }}</p>
    <KnowledgeGraph
      v-else-if="graph"
      :graph="graph"
      :selected-id="noteId ? `note:${noteId}` : `question:${questionId}`"
      compact
      @select="$emit('select', $event)"
    />
  </section>
</template>
