<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import type { WrongBookItemDto } from '../../shared/types';
import MarkdownRenderer from '../components/MarkdownRenderer.vue';

const router = useRouter();

const mode = ref<'review' | 'latest' | 'ever'>('review');
const list = ref<WrongBookItemDto[]>([]);
const loading = ref(false);
const error = ref('');

async function fetchWrongBook() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch(`/api/v1/wrong-book?mode=${mode.value}`);
    if (!res.ok) throw new Error('无法加载错题本');
    list.value = await res.json();
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

async function practiceWrongQuestion(questionId: string) {
  try {
    const creationKey = `wb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await fetch('/api/v1/practice-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creationKey,
        questionIds: [questionId],
        count: 1,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.sessionId) {
        router.push(`/practice/${data.sessionId}/1`);
      }
    }
  } catch {
    // 忽略
  }
}

async function toggleManualReview(item: WrongBookItemDto) {
  try {
    const res = await fetch(`/api/v1/question-state/${item.questionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualReview: !item.manualReview }),
    });
    if (res.ok) {
      item.manualReview = !item.manualReview;
      if (mode.value === 'review' && !item.manualReview && item.lastResult === 'correct') {
        // 如果在待复习视图，且取消了手动标记，且最近是对的，则从列表移出
        list.value = list.value.filter((i) => i.questionId !== item.questionId);
      }
    }
  } catch {
    // 忽略
  }
}

watch(mode, () => {
  fetchWrongBook();
});

onMounted(() => {
  fetchWrongBook();
});
</script>

<template>
  <div class="wrong-book-page max-w-4xl mx-auto py-8 px-4 space-y-6">
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-ctp-surface0 gap-4"
    >
      <div>
        <span class="text-xs font-semibold text-ctp-subtext1 uppercase tracking-wider"
          >错题沉淀</span
        >
        <h1 class="text-3xl font-bold text-ctp-text mt-1">错题与复习本</h1>
        <p class="text-sm text-ctp-subtext0 mt-1">
          清晰区分曾经做错、最近一次做错与主动标记的复习题。
        </p>
      </div>

      <!-- 模式切换 Tab -->
      <div
        class="flex rounded-xl p-1 bg-ctp-surface0 border border-ctp-surface1 self-start sm:self-auto"
      >
        <button
          class="px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer"
          :class="
            mode === 'review'
              ? 'bg-ctp-mauve text-ctp-crust font-bold shadow-xs'
              : 'text-ctp-subtext0 hover:text-ctp-text'
          "
          @click="mode = 'review'"
        >
          待复习 ({{ mode === 'review' ? list.length : '…' }})
        </button>
        <button
          class="px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer"
          :class="
            mode === 'latest'
              ? 'bg-ctp-mauve text-ctp-crust font-bold shadow-xs'
              : 'text-ctp-subtext0 hover:text-ctp-text'
          "
          @click="mode = 'latest'"
        >
          最近做错 ({{ mode === 'latest' ? list.length : '…' }})
        </button>
        <button
          class="px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer"
          :class="
            mode === 'ever'
              ? 'bg-ctp-mauve text-ctp-crust font-bold shadow-xs'
              : 'text-ctp-subtext0 hover:text-ctp-text'
          "
          @click="mode = 'ever'"
        >
          曾经做错 ({{ mode === 'ever' ? list.length : '…' }})
        </button>
      </div>
    </div>

    <div v-if="loading" class="py-16 text-center text-ctp-subtext0 animate-pulse">
      正在检索错题记录…
    </div>

    <div
      v-else-if="error"
      class="p-4 bg-ctp-red/10 border border-ctp-red/30 text-ctp-red rounded-xl"
    >
      {{ error }}
    </div>

    <div v-else-if="list.length === 0" class="py-20 text-center">
      <span class="text-4xl">🌱</span>
      <h3 class="text-lg font-bold text-ctp-text mt-3">暂无匹配的错题记录</h3>
      <p class="text-sm text-ctp-subtext0 mt-1">
        练习做错的题目或手动标记复习的题目将自动归纳在此处。
      </p>
      <button
        class="mt-6 px-4 py-2 bg-ctp-mauve text-ctp-crust text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
        @click="router.push('/study/math1.double-integral.definition?tab=practice')"
      >
        前往习题演练 →
      </button>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="item in list"
        :key="item.questionId"
        class="p-5 sm:p-6 bg-ctp-surface0 border border-ctp-surface1 rounded-2xl shadow-xs hover:border-ctp-mauve transition-all"
      >
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span
              class="text-xs px-2.5 py-0.5 rounded-md font-bold"
              :class="{
                'bg-ctp-red/20 text-ctp-red border border-ctp-red/30':
                  item.lastResult === 'incorrect',
                'bg-ctp-yellow/20 text-ctp-yellow border border-ctp-yellow/30':
                  item.lastResult === 'partial',
                'bg-ctp-green/20 text-ctp-green border border-ctp-green/30':
                  item.lastResult === 'correct',
              }"
            >
              最新结果：{{
                item.lastResult === 'correct'
                  ? '正确'
                  : item.lastResult === 'partial'
                    ? '部分正确'
                    : '错误'
              }}
            </span>
            <span class="text-xs text-ctp-subtext0">
              累计做错 {{ item.wrongCount }} 次 / 总答 {{ item.attemptCount }} 次
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button
              class="text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer"
              :class="
                item.manualReview
                  ? 'bg-ctp-peach/20 border-ctp-peach/40 text-ctp-peach font-bold'
                  : 'bg-ctp-mantle border-ctp-surface1 text-ctp-subtext0 hover:text-ctp-text'
              "
              @click="toggleManualReview(item)"
            >
              {{ item.manualReview ? '✓ 已标待复习' : '＋ 标为待复习' }}
            </button>
            <button
              class="px-3.5 py-1 bg-ctp-mauve hover:opacity-90 text-ctp-crust text-xs font-bold rounded-lg shadow-xs transition-opacity cursor-pointer"
              @click="practiceWrongQuestion(item.questionId)"
            >
              再练一次 →
            </button>
          </div>
        </div>

        <MarkdownRenderer :content="item.stemMd" />

        <div
          v-if="item.topics.length > 0"
          class="mt-3 flex items-center gap-2 text-xs text-ctp-subtext0"
        >
          <span>所属章节：</span>
          <span
            v-for="t in item.topics"
            :key="t.id"
            class="px-2 py-0.5 bg-ctp-surface1 text-ctp-text rounded-md font-medium"
          >
            {{ t.title }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
