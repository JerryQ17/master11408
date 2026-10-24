<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { QuestionType, TagTreeNode } from '../../shared/types';

const props = defineProps<{
  topicId: string;
  topicTitle?: string;
}>();

const emit = defineEmits<{
  (e: 'sessionCreated', sessionId: string): void;
}>();

const types = ref<QuestionType[]>(['single_choice', 'multiple_choice', 'fill_blank', 'written']);
const difficulty = ref<number[]>([]);
const statusFilter = ref<
  'all' | 'unattempted' | 'ever_wrong' | 'latest_wrong' | 'review' | 'starred'
>('all');
const count = ref(10);
const mode = ref<'ordered' | 'random'>('ordered');
const selectedTagId = ref<string>('');

const tagsTree = ref<TagTreeNode[]>([]);
const busy = ref(false);
const error = ref('');
const emptyNotice = ref(false);

async function loadTags() {
  try {
    const res = await fetch('/api/v1/tags/tree');
    if (res.ok) {
      tagsTree.value = await res.json();
    }
  } catch {
    // 忽略异常
  }
}

async function startSession() {
  busy.value = true;
  error.value = '';
  emptyNotice.value = false;

  try {
    const creationKey = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      topicIds: props.topicId ? [props.topicId] : [],
      tagIds: selectedTagId.value ? [selectedTagId.value] : [],
      types: types.value.length > 0 ? types.value : undefined,
      difficulties: difficulty.value.length > 0 ? difficulty.value : undefined,
      statusFilter: statusFilter.value,
      count: count.value,
      mode: mode.value,
      creationKey,
    };

    const res = await fetch('/api/v1/practice-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || '创建练习题组失败');
    }

    const data = await res.json();
    if (!data.sessionId || data.count === 0) {
      emptyNotice.value = true;
      return;
    }

    emit('sessionCreated', data.sessionId);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  loadTags();
});
</script>

<template>
  <div class="practice-filters max-w-2xl mx-auto py-8 px-4">
    <div class="mb-6">
      <span class="text-xs font-semibold text-ctp-subtext1 uppercase tracking-wider"
        >练习题组配置</span
      >
      <h2 class="text-2xl font-bold text-ctp-text mt-1">
        {{ topicTitle ? `练习：${topicTitle}` : '自由练习' }}
      </h2>
      <p class="text-sm text-ctp-subtext0 mt-1">
        选择题型、难度和题目范围，生成固定的单屏单题练习会话。
      </p>
    </div>

    <form
      class="space-y-6 bg-ctp-surface0 border border-ctp-surface1 p-6 sm:p-7 rounded-2xl shadow-xs"
      @submit.prevent="startSession"
    >
      <!-- 题型选择 -->
      <div>
        <label class="block text-sm font-semibold text-ctp-text mb-2.5">题型</label>
        <div class="flex flex-wrap gap-4">
          <label class="flex items-center gap-2 text-sm text-ctp-subtext0 cursor-pointer">
            <input v-model="types" type="checkbox" value="single_choice" class="accent-ctp-mauve" />
            <span>单选题</span>
          </label>
          <label class="flex items-center gap-2 text-sm text-ctp-subtext0 cursor-pointer">
            <input
              v-model="types"
              type="checkbox"
              value="multiple_choice"
              class="accent-ctp-mauve"
            />
            <span>多选题</span>
          </label>
          <label class="flex items-center gap-2 text-sm text-ctp-subtext0 cursor-pointer">
            <input v-model="types" type="checkbox" value="fill_blank" class="accent-ctp-mauve" />
            <span>填空题</span>
          </label>
          <label class="flex items-center gap-2 text-sm text-ctp-subtext0 cursor-pointer">
            <input v-model="types" type="checkbox" value="written" class="accent-ctp-mauve" />
            <span>解答/证明题</span>
          </label>
        </div>
      </div>

      <!-- 答题状态筛选 -->
      <div>
        <label class="block text-sm font-semibold text-ctp-text mb-2.5">作答状态</label>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <button
            v-for="item in [
              { label: '全部', val: 'all' },
              { label: '未做题', val: 'unattempted' },
              { label: '曾做错', val: 'ever_wrong' },
              { label: '最近做错', val: 'latest_wrong' },
              { label: '待复习', val: 'review' },
              { label: '已收藏', val: 'starred' },
            ]"
            :key="item.val"
            type="button"
            class="px-2 py-1.5 text-xs font-medium rounded-lg border text-center transition-all cursor-pointer"
            :class="
              statusFilter === item.val
                ? 'bg-ctp-mauve text-ctp-crust border-ctp-mauve font-bold shadow-2xs'
                : 'bg-ctp-mantle text-ctp-subtext0 border-ctp-surface1 hover:border-ctp-surface2 hover:text-ctp-text'
            "
            @click="statusFilter = item.val as any"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <!-- 标签筛选 -->
      <div v-if="tagsTree.length > 0">
        <label class="block text-sm font-semibold text-ctp-text mb-2">标签 / 题源分类</label>
        <select
          v-model="selectedTagId"
          class="w-full px-3 py-2 border border-ctp-surface1 rounded-lg bg-ctp-mantle text-sm text-ctp-text focus:outline-none focus:ring-2 focus:ring-ctp-mauve/30 focus:border-ctp-mauve"
        >
          <option value="">不限分类（包含全部标签）</option>
          <template v-for="tag in tagsTree" :key="tag.id">
            <option :value="tag.id">{{ tag.name }}</option>
            <option v-for="child in tag.children" :key="child.id" :value="child.id">
              &nbsp;&nbsp;↳ {{ child.name }}
            </option>
          </template>
        </select>
      </div>

      <!-- 题量与排序 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-semibold text-ctp-text mb-1.5">题量</label>
          <select
            v-model="count"
            class="w-full px-3 py-2 border border-ctp-surface1 rounded-lg bg-ctp-mantle text-sm text-ctp-text focus:outline-none focus:ring-2 focus:ring-ctp-mauve/30 focus:border-ctp-mauve"
          >
            <option :value="5">5 题（快速演练）</option>
            <option :value="10">10 题（推荐节段）</option>
            <option :value="20">20 题（深度巩固）</option>
            <option :value="50">50 题（模块冲刺）</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-semibold text-ctp-text mb-1.5">出题顺序</label>
          <select
            v-model="mode"
            class="w-full px-3 py-2 border border-ctp-surface1 rounded-lg bg-ctp-mantle text-sm text-ctp-text focus:outline-none focus:ring-2 focus:ring-ctp-mauve/30 focus:border-ctp-mauve"
          >
            <option value="ordered">按大纲顺序递进</option>
            <option value="random">随机乱序抽题</option>
          </select>
        </div>
      </div>

      <div
        v-if="emptyNotice"
        class="p-3 bg-ctp-yellow/10 text-ctp-yellow rounded-lg text-sm border border-ctp-yellow/30"
      >
        ⚠️ 当前筛选条件下没有匹配到题目，请尝试放宽筛选状态或选择包含子分类。
      </div>

      <div
        v-if="error"
        class="p-3 bg-ctp-red/10 text-ctp-red rounded-lg text-sm border border-ctp-red/30"
      >
        {{ error }}
      </div>

      <button
        type="submit"
        class="w-full py-3 bg-ctp-mauve hover:opacity-90 text-ctp-crust font-bold rounded-xl shadow-xs transition-opacity disabled:opacity-50 cursor-pointer"
        :disabled="busy || types.length === 0"
      >
        {{ busy ? '正在生成题组…' : '开始练习 →' }}
      </button>
    </form>
  </div>
</template>
