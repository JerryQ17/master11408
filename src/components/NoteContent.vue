<script setup lang="ts">
import { ref, watch } from 'vue';
import type { NoteDetailDto, GraphNodeDto } from '../../shared/types';
import { fetchJson } from '../app/knowledge';
import MarkdownRenderer from './MarkdownRenderer.vue';
import LocalGraph from './LocalGraph.vue';

const props = withDefaults(defineProps<{ noteId: string; practiceEnabled?: boolean }>(), {
  practiceEnabled: true,
});
const emit = defineEmits<{ openNote: [id: string]; practiceQuestion: [id: string] }>();
const note = ref<NoteDetailDto | null>(null);
const loading = ref(false);
const error = ref('');
watch(
  () => props.noteId,
  async (id, _, onCleanup) => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    note.value = null;
    loading.value = true;
    error.value = '';
    try {
      const result = await fetchJson<NoteDetailDto>(`/api/v1/notes/${encodeURIComponent(id)}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) note.value = result;
    } catch (err) {
      if (!controller.signal.aborted) error.value = (err as Error).message;
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  },
  { immediate: true },
);

function selectNode(node: GraphNodeDto) {
  if (node.kind === 'note' && node.entityId !== props.noteId) emit('openNote', node.entityId);
  if (node.kind === 'question' && props.practiceEnabled) emit('practiceQuestion', node.entityId);
}
</script>

<template>
  <p v-if="loading" role="status" class="p-6 text-ctp-subtext0">正在加载笔记…</p>
  <p v-else-if="error" role="alert" class="p-6 text-ctp-red">{{ error }}</p>
  <article v-else-if="note" class="space-y-7">
    <div class="flex flex-wrap gap-4 text-sm text-ctp-mauve">
      <RouterLink
        :to="`/study/${note.topicId}?tab=notes`"
        :target="practiceEnabled ? undefined : '_blank'"
        rel="noopener"
        >所属章节</RouterLink
      >
      <RouterLink
        :to="`/graph/${note.subjectId}`"
        :target="practiceEnabled ? undefined : '_blank'"
        rel="noopener"
        >科目图谱 →</RouterLink
      >
    </div>
    <h2 class="text-2xl font-bold">{{ note.title }}</h2>
    <MarkdownRenderer
      :content="note.bodyMd"
      :question-links-enabled="practiceEnabled"
      @select-question="practiceEnabled && emit('practiceQuestion', $event)"
    />
    <div class="grid sm:grid-cols-2 gap-5 border-t border-ctp-surface1 pt-5">
      <section
        v-for="group in [
          { title: '引用的笔记', items: note.references },
          { title: '被这些笔记引用', items: note.backlinks },
        ]"
        :key="group.title"
      >
        <h3 class="font-semibold text-sm mb-3">{{ group.title }}</h3>
        <p v-if="!group.items.length" class="text-sm text-ctp-subtext0">暂无引用</p>
        <ul class="space-y-2">
          <li v-for="item in group.items" :key="item.id">
            <button
              class="text-sm text-ctp-mauve text-left hover:underline cursor-pointer"
              @click="emit('openNote', item.id)"
            >
              {{ item.title }}
            </button>
          </li>
        </ul>
      </section>
    </div>
    <section aria-label="关联习题">
      <h3 class="font-semibold text-sm mb-3">关联习题（{{ note.questions.length }}）</h3>
      <p v-if="!note.questions.length" class="text-sm text-ctp-subtext0">暂无关联习题</p>
      <ul class="flex flex-wrap gap-2">
        <li v-for="question in note.questions" :key="question.id">
          <button
            v-if="practiceEnabled"
            class="px-3 py-2 rounded-lg border border-ctp-surface1 text-sm text-ctp-mauve cursor-pointer hover:bg-ctp-surface0"
            @click="emit('practiceQuestion', question.id)"
          >
            练习 {{ question.id }} →
          </button>
          <span v-else class="text-xs text-ctp-subtext0">{{ question.id }}</span>
        </li>
      </ul>
      <RouterLink
        v-if="!practiceEnabled && note.questions.length"
        :to="`/notes/${note.id}`"
        target="_blank"
        rel="noopener"
        class="inline-block mt-3 text-sm text-ctp-mauve"
        >在新页面阅读并练习 →</RouterLink
      >
    </section>
    <LocalGraph :note-id="note.id" @select="selectNode" />
  </article>
</template>
