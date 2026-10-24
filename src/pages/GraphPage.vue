<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { KnowledgeGraphDto, GraphNodeDto } from '../../shared/types';
import { fetchJson, createQuestionPractice } from '../app/knowledge';
import KnowledgeGraph from '../components/KnowledgeGraph.vue';

const route = useRoute();
const router = useRouter();
const subjectId = computed(() => route.params.subjectId as string);
const topicId = ref('');
const search = ref('');
const expandedNoteId = ref('');
const selected = ref<GraphNodeDto | null>(null);
const graph = ref<KnowledgeGraphDto | null>(null);
const loading = ref(false);
const error = ref('');
const actionError = ref('');
const starting = ref(false);

watch(subjectId, () => {
  topicId.value = '';
  search.value = '';
  expandedNoteId.value = '';
  selected.value = null;
});
watch(topicId, () => {
  expandedNoteId.value = '';
  selected.value = null;
});
watch(
  () => [subjectId.value, topicId.value, expandedNoteId.value],
  async (_, __, onCleanup) => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    loading.value = true;
    error.value = '';
    try {
      const query = new URLSearchParams({ subjectId: subjectId.value });
      if (topicId.value) query.set('topicId', topicId.value);
      if (expandedNoteId.value) query.set('expandNoteId', expandedNoteId.value);
      const result = await fetchJson<KnowledgeGraphDto>(`/api/v1/graph?${query}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        graph.value = result;
        if (selected.value && !result.nodes.some((n) => n.id === selected.value!.id))
          selected.value = null;
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        graph.value = null;
        error.value = (err as Error).message;
      }
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  },
  { immediate: true },
);

const visibleGraph = computed<KnowledgeGraphDto | null>(() => {
  if (!graph.value) return null;
  const term = search.value.trim().toLocaleLowerCase();
  if (!term) return graph.value;
  const nodes = graph.value.nodes.filter((n) =>
    `${n.title} ${n.entityId}`.toLocaleLowerCase().includes(term),
  );
  const ids = new Set(nodes.map((n) => n.id));
  return {
    ...graph.value,
    nodes,
    edges: graph.value.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
});

async function practice(id: string) {
  if (starting.value) return;
  starting.value = true;
  actionError.value = '';
  try {
    await router.push(`/practice/${await createQuestionPractice(id)}/1`);
  } catch (err) {
    actionError.value = (err as Error).message;
  } finally {
    starting.value = false;
  }
}
function changeSubject(event: Event) {
  router.push(`/graph/${(event.target as HTMLSelectElement).value}`);
}
</script>

<template>
  <main class="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">
    <div>
      <p class="text-xs text-ctp-mauve mb-2">把知识串起来</p>
      <h1 class="text-2xl font-bold">
        {{ graph?.subjects.find((s) => s.id === subjectId)?.title || '科目' }}知识图谱
      </h1>
      <p class="text-sm text-ctp-subtext0 mt-2">
        默认展示考点笔记与引用关系，选中笔记可展开关联习题。
      </p>
    </div>
    <div v-if="graph" class="flex flex-wrap gap-3">
      <label class="text-sm"
        >科目
        <select
          aria-label="选择科目"
          :value="subjectId"
          class="graph-input"
          @change="changeSubject"
        >
          <option v-for="subject in graph.subjects" :key="subject.id" :value="subject.id">
            {{ subject.title }}
          </option>
        </select>
      </label>
      <label class="text-sm"
        >章节
        <select v-model="topicId" aria-label="筛选章节" class="graph-input">
          <option value="">全部章节</option>
          <option
            v-for="topic in graph.topics.filter((t) => t.id !== subjectId)"
            :key="topic.id"
            :value="topic.id"
          >
            {{ topic.title }}
          </option>
        </select>
      </label>
      <label class="text-sm"
        >搜索
        <input
          v-model="search"
          type="search"
          aria-label="搜索图谱"
          placeholder="笔记标题或 ID"
          class="graph-input"
        />
      </label>
    </div>
    <p v-if="loading" role="status" class="text-sm text-ctp-subtext0">正在加载图谱…</p>
    <p v-if="error" role="alert" class="text-ctp-red">{{ error }}</p>
    <div v-if="visibleGraph" class="grid lg:grid-cols-[1fr_280px] gap-5">
      <KnowledgeGraph
        :graph="visibleGraph"
        :selected-id="selected?.id"
        @select="selected = $event"
      />
      <aside
        aria-label="节点详情"
        class="p-5 rounded-xl border border-ctp-surface1 bg-ctp-mantle space-y-4 self-start"
      >
        <template v-if="selected">
          <p class="text-xs text-ctp-subtext0">
            {{ selected.kind === 'note' ? '考点笔记' : '关联习题' }}
          </p>
          <h2 class="font-semibold break-words">{{ selected.title }}</h2>
          <template v-if="selected.kind === 'note'">
            <RouterLink :to="`/notes/${selected.entityId}`" class="block text-sm text-ctp-mauve"
              >阅读笔记与反向链接 →</RouterLink
            >
            <button
              class="graph-action"
              @click="
                expandedNoteId = expandedNoteId === selected.entityId ? '' : selected.entityId
              "
            >
              {{ expandedNoteId === selected.entityId ? '收起关联习题' : '展开关联习题' }}
            </button>
          </template>
          <button
            v-else
            class="graph-action"
            :disabled="starting"
            @click="practice(selected.entityId)"
          >
            {{ starting ? '正在创建练习…' : '练习该题 →' }}
          </button>
        </template>
        <p v-else class="text-sm text-ctp-subtext0">点击图中节点，或展开下方列表选择笔记。</p>
        <p v-if="actionError" role="alert" class="text-sm text-ctp-red">{{ actionError }}</p>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.graph-input {
  margin-left: 0.5rem;
  padding: 0.6rem;
  border: 1px solid var(--ctp-surface1);
  border-radius: 0.6rem;
  background: var(--ctp-mantle);
  max-width: 100%;
}
.graph-action {
  border-radius: 0.6rem;
  padding: 0.65rem 1rem;
  background: var(--ctp-mauve);
  color: var(--ctp-crust);
  cursor: pointer;
  font-size: 0.875rem;
}
</style>
