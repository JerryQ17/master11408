<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { SessionItemViewDto, AttemptResult } from '../../shared/types';
import MarkdownRenderer from './MarkdownRenderer.vue';

const props = defineProps<{
  sessionId: string;
  initialOrdinal?: number;
}>();

defineEmits<{
  (e: 'exit'): void;
}>();

const currentOrdinal = ref(props.initialOrdinal ?? 1);
const itemView = ref<SessionItemViewDto | null>(null);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');

// 客户端当前草稿作答
const selectedKeys = ref<string[]>([]);
const responseText = ref('');
const isEditingSelfEval = ref(false);

const isChoice = computed(() => {
  return (
    itemView.value?.question.type === 'single_choice' ||
    itemView.value?.question.type === 'multiple_choice'
  );
});

const isMulti = computed(() => {
  return itemView.value?.question.type === 'multiple_choice';
});

const isSubjective = computed(() => {
  return (
    itemView.value?.question.type === 'fill_blank' || itemView.value?.question.type === 'written'
  );
});

const hasAttempt = computed(() => {
  return !!itemView.value?.attempt;
});

const isEvaluated = computed(() => {
  return itemView.value?.attempt?.state === 'evaluated';
});

const isPendingSelfEval = computed(() => {
  return itemView.value?.attempt?.state === 'revealed_pending_self_eval';
});

// 从 sessionStorage 读取当前未提交选项草稿
function loadDraft() {
  const key = `draft_${props.sessionId}_${currentOrdinal.value}`;
  const saved = sessionStorage.getItem(key);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      selectedKeys.value = data.selectedKeys || [];
      responseText.value = data.responseText || '';
    } catch {
      // 忽略
    }
  } else {
    selectedKeys.value = [];
    responseText.value = '';
  }
}

function saveDraft() {
  if (hasAttempt.value) return;
  const key = `draft_${props.sessionId}_${currentOrdinal.value}`;
  sessionStorage.setItem(
    key,
    JSON.stringify({
      selectedKeys: selectedKeys.value,
      responseText: responseText.value,
    }),
  );
}

async function fetchItem(ordinal: number) {
  loading.value = true;
  error.value = '';
  isEditingSelfEval.value = false;
  try {
    const res = await fetch(`/api/v1/practice-sessions/${props.sessionId}/items/${ordinal}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || '无法读取该题');
    }
    const data: SessionItemViewDto = await res.json();
    itemView.value = data;
    currentOrdinal.value = ordinal;

    if (data.attempt) {
      if (data.attempt.selectedAnswerJson) {
        selectedKeys.value = JSON.parse(data.attempt.selectedAnswerJson);
      }
      if (data.attempt.responseText) {
        responseText.value = data.attempt.responseText;
      }
    } else {
      loadDraft();
    }
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

function toggleOption(key: string) {
  if (hasAttempt.value) return;
  if (isMulti.value) {
    if (selectedKeys.value.includes(key)) {
      selectedKeys.value = selectedKeys.value.filter((k) => k !== key);
    } else {
      selectedKeys.value.push(key);
    }
  } else {
    selectedKeys.value = [key];
  }
  saveDraft();
}

async function submitObjective() {
  if (!itemView.value || selectedKeys.value.length === 0 || submitting.value || hasAttempt.value)
    return;
  submitting.value = true;
  error.value = '';

  const idempotencyKey = `sub-${props.sessionId}-${currentOrdinal.value}`;
  try {
    const res = await fetch('/api/v1/attempts/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        practiceSessionId: props.sessionId,
        ordinal: currentOrdinal.value,
        revision: itemView.value.question.revision,
        selectedKeys: selectedKeys.value,
        idempotencyKey,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || '提交答案失败');
    }

    await res.json();
    // 刷新该条目状态
    await fetchItem(currentOrdinal.value);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    submitting.value = false;
  }
}

async function revealSubjective() {
  if (!itemView.value || submitting.value || hasAttempt.value) return;
  submitting.value = true;
  error.value = '';

  const idempotencyKey = `rev-${props.sessionId}-${currentOrdinal.value}`;
  try {
    const res = await fetch('/api/v1/attempts/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        practiceSessionId: props.sessionId,
        ordinal: currentOrdinal.value,
        revision: itemView.value.question.revision,
        responseText: responseText.value,
        idempotencyKey,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || '查看解析失败');
    }

    await fetchItem(currentOrdinal.value);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    submitting.value = false;
  }
}

async function submitSelfEval(result: AttemptResult) {
  if (!itemView.value?.attempt || submitting.value) return;
  submitting.value = true;
  error.value = '';

  try {
    const res = await fetch(`/api/v1/attempts/${itemView.value.attempt.id}/self-evaluation`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        result,
        expectedVersion: itemView.value.attempt.evaluationVersion,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || '自评提交失败');
    }

    isEditingSelfEval.value = false;
    await fetchItem(currentOrdinal.value);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    submitting.value = false;
  }
}

async function toggleManualReview() {
  if (!itemView.value) return;
  const current = itemView.value.question.userState?.manualReview ?? false;
  try {
    const res = await fetch(`/api/v1/question-state/${itemView.value.question.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualReview: !current }),
    });
    if (res.ok) {
      if (!itemView.value.question.userState) {
        itemView.value.question.userState = {
          manualReview: !current,
          starred: false,
          lastResult: null,
        };
      } else {
        itemView.value.question.userState.manualReview = !current;
      }
    }
  } catch {
    // 忽略异常
  }
}

async function toggleStarred() {
  if (!itemView.value) return;
  const current = itemView.value.question.userState?.starred ?? false;
  try {
    const res = await fetch(`/api/v1/question-state/${itemView.value.question.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: !current }),
    });
    if (res.ok) {
      if (!itemView.value.question.userState) {
        itemView.value.question.userState = {
          manualReview: false,
          starred: !current,
          lastResult: null,
        };
      } else {
        itemView.value.question.userState.starred = !current;
      }
    }
  } catch {
    // 忽略异常
  }
}

function goPrev() {
  if (currentOrdinal.value > 1) {
    fetchItem(currentOrdinal.value - 1);
  }
}

function goNext() {
  if (itemView.value && currentOrdinal.value < itemView.value.totalCount) {
    fetchItem(currentOrdinal.value + 1);
  }
}

// 键盘快捷键监听
function onKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  const isInput =
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

  if (isInput) return;

  // 左右方向键切题
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    goPrev();
    return;
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    goNext();
    return;
  }

  // 字母 A-F 或数字 1-6 快速选择选项
  if (isChoice.value && !hasAttempt.value) {
    const keyMap: Record<string, string> = {
      a: 'A',
      b: 'B',
      c: 'C',
      d: 'D',
      e: 'E',
      f: 'F',
      '1': 'A',
      '2': 'B',
      '3': 'C',
      '4': 'D',
      '5': 'E',
      '6': 'F',
    };
    const choiceKey = keyMap[e.key.toLowerCase()];
    if (choiceKey) {
      e.preventDefault();
      toggleOption(choiceKey);
      return;
    }
  }

  // 回车键：提交客观题、揭示主观题或进入下一题
  if (e.key === 'Enter') {
    if (!hasAttempt.value) {
      if (isChoice.value && selectedKeys.value.length > 0) {
        e.preventDefault();
        submitObjective();
      } else if (isSubjective.value) {
        e.preventDefault();
        revealSubjective();
      }
    } else if (!isPendingSelfEval.value) {
      if (itemView.value && currentOrdinal.value < itemView.value.totalCount) {
        e.preventDefault();
        goNext();
      }
    }
  }
}

onMounted(() => {
  fetchItem(currentOrdinal.value);
  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
});

watch(
  () => props.initialOrdinal,
  (newOrd) => {
    if (newOrd && newOrd !== currentOrdinal.value) {
      fetchItem(newOrd);
    }
  },
);
</script>

<template>
  <div class="practice-screen max-w-3xl mx-auto py-6 px-4">
    <!-- 顶部状态栏 -->
    <div class="flex items-center justify-between pb-4 border-b border-ctp-surface0 mb-6">
      <div class="flex items-center gap-3">
        <button
          class="text-xs px-2.5 py-1 bg-ctp-surface0 border border-ctp-surface1 text-ctp-subtext0 rounded-lg hover:bg-ctp-surface1 hover:text-ctp-text transition-colors cursor-pointer"
          @click="$emit('exit')"
        >
          ← 返回题组列表
        </button>
        <span class="text-xs font-semibold text-ctp-subtext1 tracking-wider uppercase">
          题号 {{ currentOrdinal }} / {{ itemView?.totalCount || '—' }}
        </span>
      </div>

      <div class="flex items-center gap-3">
        <!-- 收藏按钮 -->
        <button
          class="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer"
          :class="
            itemView?.question.userState?.starred
              ? 'bg-ctp-yellow/20 border-ctp-yellow/40 text-ctp-yellow font-bold shadow-2xs'
              : 'bg-ctp-surface0 border-ctp-surface1 text-ctp-subtext0 hover:text-ctp-text'
          "
          @click="toggleStarred"
        >
          <span>{{ itemView?.question.userState?.starred ? '★ 已收藏' : '☆ 收藏' }}</span>
        </button>

        <!-- 手动复习按钮 -->
        <button
          class="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer"
          :class="
            itemView?.question.userState?.manualReview
              ? 'bg-ctp-peach/20 border-ctp-peach/40 text-ctp-peach font-bold shadow-2xs'
              : 'bg-ctp-surface0 border-ctp-surface1 text-ctp-subtext0 hover:text-ctp-text'
          "
          @click="toggleManualReview"
        >
          <span>{{ itemView?.question.userState?.manualReview ? '✓ 需复习' : '＋ 标记复习' }}</span>
        </button>
      </div>
    </div>

    <!-- 题目区域 -->
    <div v-if="loading" class="py-20 text-center text-ctp-subtext0 animate-pulse">
      正在加载题目…
    </div>

    <div
      v-else-if="error"
      class="p-4 bg-ctp-red/10 border border-ctp-red/30 text-ctp-red rounded-xl mb-6"
    >
      {{ error }}
    </div>

    <div v-else-if="itemView" class="space-y-6">
      <!-- 题目卡片 -->
      <div class="bg-ctp-surface0 border border-ctp-surface1 rounded-2xl p-6 shadow-xs">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xs px-2.5 py-0.5 rounded-md bg-ctp-mauve text-ctp-crust font-bold">
            {{
              itemView.question.type === 'single_choice'
                ? '单选题'
                : itemView.question.type === 'multiple_choice'
                  ? '多选题'
                  : itemView.question.type === 'fill_blank'
                    ? '填空题'
                    : '解答证明题'
            }}
          </span>
          <span class="text-xs text-ctp-subtext0">难度 {{ itemView.question.difficulty }} 星</span>
        </div>

        <!-- 题干 -->
        <MarkdownRenderer :content="itemView.question.stemMd" />

        <!-- 选择题选项列表 -->
        <div v-if="isChoice && itemView.question.options" class="mt-6 space-y-3">
          <div
            v-for="opt in itemView.question.options"
            :key="opt.key"
            role="button"
            :tabindex="hasAttempt ? -1 : 0"
            :aria-pressed="selectedKeys.includes(opt.key)"
            class="option-card flex items-start gap-3 p-3.5 rounded-xl border text-sm cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-ctp-mauve/50"
            :class="{
              'border-ctp-mauve bg-ctp-mauve/15 shadow-2xs':
                selectedKeys.includes(opt.key) && !hasAttempt,
              'border-ctp-surface1 bg-ctp-mantle hover:bg-ctp-surface1/60 text-ctp-text':
                !selectedKeys.includes(opt.key) && !hasAttempt,
              'border-ctp-green bg-ctp-green/15 text-ctp-green font-medium':
                hasAttempt &&
                (itemView.solution?.correctAnswer === opt.key ||
                  (Array.isArray(itemView.solution?.correctAnswer) &&
                    itemView.solution?.correctAnswer.includes(opt.key))),
              'border-ctp-red bg-ctp-red/15 text-ctp-red opacity-90':
                hasAttempt &&
                selectedKeys.includes(opt.key) &&
                !(
                  itemView.solution?.correctAnswer === opt.key ||
                  (Array.isArray(itemView.solution?.correctAnswer) &&
                    itemView.solution?.correctAnswer.includes(opt.key))
                ),
              'opacity-60 cursor-default': hasAttempt,
            }"
            @click="toggleOption(opt.key)"
            @keydown.enter.prevent.stop="toggleOption(opt.key)"
            @keydown.space.prevent.stop="toggleOption(opt.key)"
          >
            <span
              class="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold shrink-0 mt-0.5"
              :class="
                selectedKeys.includes(opt.key)
                  ? 'bg-ctp-mauve text-ctp-crust'
                  : 'bg-ctp-surface1 text-ctp-subtext1'
              "
            >
              {{ opt.key }}
            </span>
            <div class="flex-1">
              <MarkdownRenderer :content="opt.content" />
            </div>
          </div>
        </div>

        <!-- 主观题自填草稿输入框 -->
        <div v-if="isSubjective" class="mt-6">
          <label class="block text-xs font-semibold text-ctp-subtext1 mb-1.5"
            >你的作答 / 证明草稿（可选）</label
          >
          <textarea
            v-model="responseText"
            rows="4"
            class="w-full p-3 border border-ctp-surface1 rounded-xl bg-ctp-mantle text-sm text-ctp-text placeholder-ctp-overlay0 focus:outline-none focus:ring-2 focus:ring-ctp-mauve/30 focus:border-ctp-mauve"
            placeholder="在此键入你的解题思路或最终答案，点击下方“查看解析”后对照自评…"
            :disabled="hasAttempt"
            @input="saveDraft"
          />
        </div>

        <!-- 提交 / 揭示按钮 -->
        <div v-if="!hasAttempt" class="mt-6 flex justify-end">
          <button
            v-if="isChoice"
            class="px-6 py-2.5 bg-ctp-mauve hover:opacity-90 text-ctp-crust text-sm font-bold rounded-xl shadow-xs transition-opacity disabled:opacity-50 cursor-pointer"
            :disabled="selectedKeys.length === 0 || submitting"
            @click="submitObjective"
          >
            {{ submitting ? '正在判分…' : '提交答案 ↵' }}
          </button>
          <button
            v-else
            class="px-6 py-2.5 bg-ctp-mauve hover:opacity-90 text-ctp-crust text-sm font-bold rounded-xl shadow-xs transition-opacity disabled:opacity-50 cursor-pointer"
            :disabled="submitting"
            @click="revealSubjective"
          >
            {{ submitting ? '正在呈现…' : '查看解析并自评 →' }}
          </button>
        </div>
      </div>

      <!-- 解析与自评卡片 (仅提交或揭示后可见) -->
      <div
        v-if="hasAttempt && itemView.solution"
        class="bg-ctp-surface0 border border-ctp-surface1 rounded-2xl p-6 shadow-xs space-y-4"
      >
        <div class="flex items-center justify-between pb-3 border-b border-ctp-surface1">
          <div class="flex items-center gap-2">
            <span
              class="text-xs px-2.5 py-1 rounded-md font-bold"
              :class="{
                'bg-ctp-green/20 text-ctp-green border border-ctp-green/30':
                  itemView.attempt?.result === 'correct',
                'bg-ctp-yellow/20 text-ctp-yellow border border-ctp-yellow/30':
                  itemView.attempt?.result === 'partial',
                'bg-ctp-red/20 text-ctp-red border border-ctp-red/30':
                  itemView.attempt?.result === 'incorrect',
                'bg-ctp-blue/20 text-ctp-blue border border-ctp-blue/30': isPendingSelfEval,
              }"
            >
              {{
                isPendingSelfEval
                  ? '等待自评'
                  : itemView.attempt?.result === 'correct'
                    ? '✓ 正确'
                    : itemView.attempt?.result === 'partial'
                      ? '△ 部分正确'
                      : '✕ 错误'
              }}
            </span>
            <span class="text-sm font-medium text-ctp-text">
              参考答案：
              <code class="font-bold text-ctp-mauve">
                {{
                  Array.isArray(itemView.solution.correctAnswer)
                    ? itemView.solution.correctAnswer.join(', ')
                    : itemView.solution.correctAnswer
                }}
              </code>
            </span>
          </div>

          <!-- 主观题更正自评按钮 -->
          <button
            v-if="isSubjective && isEvaluated && !isEditingSelfEval"
            class="text-xs text-ctp-mauve hover:underline cursor-pointer"
            @click="isEditingSelfEval = true"
          >
            更正自评结果 ✎
          </button>
        </div>

        <!-- 主观题自评按钮区域 -->
        <div
          v-if="isSubjective && (isPendingSelfEval || isEditingSelfEval)"
          class="p-4 bg-ctp-mantle rounded-xl border border-ctp-surface1"
        >
          <p class="text-xs text-ctp-subtext0 mb-3 font-medium">
            请核对上方参考答案与解析，给出本次作答评价：
          </p>
          <div class="flex flex-wrap gap-3">
            <button
              class="px-4 py-2 bg-ctp-green hover:opacity-90 text-ctp-crust text-xs font-bold rounded-lg shadow-xs transition-opacity cursor-pointer"
              :disabled="submitting"
              @click="submitSelfEval('correct')"
            >
              ✓ 正确（完全符合）
            </button>
            <button
              class="px-4 py-2 bg-ctp-yellow hover:opacity-90 text-ctp-crust text-xs font-bold rounded-lg shadow-xs transition-opacity cursor-pointer"
              :disabled="submitting"
              @click="submitSelfEval('partial')"
            >
              △ 部分正确（步骤/计算有瑕疵）
            </button>
            <button
              class="px-4 py-2 bg-ctp-red hover:opacity-90 text-ctp-crust text-xs font-bold rounded-lg shadow-xs transition-opacity cursor-pointer"
              :disabled="submitting"
              @click="submitSelfEval('incorrect')"
            >
              ✕ 错误（思路偏差或未掌握）
            </button>
            <button
              v-if="isEditingSelfEval"
              class="px-3 py-2 border border-ctp-surface1 bg-ctp-surface0 text-xs text-ctp-subtext0 hover:text-ctp-text rounded-lg cursor-pointer"
              @click="isEditingSelfEval = false"
            >
              取消
            </button>
          </div>
        </div>

        <!-- 解析详情 -->
        <div>
          <h4 class="text-xs font-bold text-ctp-subtext1 uppercase tracking-wider mb-2">
            解析详情
          </h4>
          <MarkdownRenderer :content="itemView.solution.explanationMd" />
        </div>
      </div>

      <!-- 底部导航栏：上一题 / 下一题 -->
      <div class="flex items-center justify-between pt-4">
        <button
          class="px-4 py-2 text-sm bg-ctp-surface0 border border-ctp-surface1 rounded-xl text-ctp-text hover:bg-ctp-surface1 disabled:opacity-40 transition-colors cursor-pointer"
          :disabled="currentOrdinal <= 1"
          @click="goPrev"
        >
          ← 上一题 [←]
        </button>

        <span class="text-xs text-ctp-subtext0"
          >快捷键：← / → 切题，A–D 或 1–4 勾选，Enter ↵ 提交答案 / 进入下一题</span
        >

        <button
          class="px-4 py-2 text-sm bg-ctp-mauve text-ctp-crust font-bold rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
          :disabled="!itemView || currentOrdinal >= itemView.totalCount"
          @click="goNext"
        >
          下一题 [→]
        </button>
      </div>
    </div>
  </div>
</template>
