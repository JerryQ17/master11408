<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { StatisticsDto } from '../../shared/types';

const stats = ref<StatisticsDto | null>(null);
const loading = ref(true);
const error = ref('');

async function fetchStats() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/v1/statistics');
    if (!res.ok) throw new Error('无法加载学习统计数据');
    stats.value = await res.json();
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchStats();
});
</script>

<template>
  <div class="statistics-page max-w-4xl mx-auto py-8 px-4 space-y-8">
    <div class="pb-6 border-b border-ctp-surface0">
      <span class="text-xs font-semibold text-ctp-subtext1 uppercase tracking-wider"
        >复习进度总览</span
      >
      <h1 class="text-3xl font-bold text-ctp-text mt-1">学习数据统计</h1>
      <p class="text-sm text-ctp-subtext0 mt-1">口径明确、计算严谨的刷题与掌握度指标。</p>
    </div>

    <div v-if="loading" class="py-16 text-center text-ctp-subtext0 animate-pulse">
      正在汇总学习记录…
    </div>

    <div
      v-else-if="error"
      class="p-4 bg-ctp-red/10 border border-ctp-red/30 text-ctp-red rounded-xl"
    >
      {{ error }}
    </div>

    <div v-else-if="stats" class="space-y-8">
      <!-- 核心指标卡片网格 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <!-- 1. 已做题数 -->
        <div class="p-6 bg-ctp-surface0 border border-ctp-surface1 rounded-2xl shadow-xs">
          <span class="text-xs font-semibold text-ctp-subtext1 uppercase tracking-wider"
            >已做题数</span
          >
          <div class="text-3xl font-bold text-ctp-text mt-2">
            {{ stats.attemptedCount }} <span class="text-sm font-normal text-ctp-subtext0">题</span>
          </div>
          <p class="text-xs text-ctp-subtext0 mt-2">
            至少有一次已评价尝试的去重题目数（不含未评价草稿）。
          </p>
        </div>

        <!-- 2. 最近结果正确率 -->
        <div class="p-6 bg-ctp-surface0 border border-ctp-surface1 rounded-2xl shadow-xs">
          <span class="text-xs font-semibold text-ctp-subtext1 uppercase tracking-wider"
            >最近结果正确率</span
          >
          <div class="text-3xl font-bold text-ctp-green mt-2">
            {{
              stats.latestAccuracy.rate !== null
                ? `${Math.round(stats.latestAccuracy.rate * 100)}%`
                : '—'
            }}
            <span class="text-sm font-normal text-ctp-subtext0 ml-2"
              >({{ stats.latestAccuracy.correct }} / {{ stats.latestAccuracy.total }})</span
            >
          </div>
          <p class="text-xs text-ctp-subtext0 mt-2">每道已做题最新一次评价为正确的分数占比。</p>
        </div>

        <!-- 3. 历史作答正确率 -->
        <div class="p-6 bg-ctp-surface0 border border-ctp-surface1 rounded-2xl shadow-xs">
          <span class="text-xs font-semibold text-ctp-subtext1 uppercase tracking-wider"
            >历史作答正确率</span
          >
          <div class="text-3xl font-bold text-ctp-sapphire mt-2">
            {{
              stats.historyAccuracy.rate !== null
                ? `${Math.round(stats.historyAccuracy.rate * 100)}%`
                : '—'
            }}
            <span class="text-sm font-normal text-ctp-subtext0 ml-2"
              >({{ stats.historyAccuracy.correct }} / {{ stats.historyAccuracy.total }})</span
            >
          </div>
          <p class="text-xs text-ctp-subtext0 mt-2">
            所有提交与自评记录中评价为正确比例的全局总和。
          </p>
        </div>

        <!-- 4. 待自评题数 -->
        <div class="p-6 bg-ctp-surface0 border border-ctp-surface1 rounded-2xl shadow-xs">
          <span class="text-xs font-semibold text-ctp-subtext1 uppercase tracking-wider"
            >待自评题数</span
          >
          <div class="text-3xl font-bold text-ctp-yellow mt-2">
            {{ stats.pendingSelfEvalCount }}
            <span class="text-sm font-normal text-ctp-subtext0">题</span>
          </div>
          <p class="text-xs text-ctp-subtext0 mt-2">已揭示参考答案但尚未打分的主观题。</p>
        </div>

        <!-- 5. 待复习题数 -->
        <div class="p-6 bg-ctp-surface0 border border-ctp-surface1 rounded-2xl shadow-xs">
          <span class="text-xs font-semibold text-ctp-subtext1 uppercase tracking-wider"
            >待复习题数</span
          >
          <div class="text-3xl font-bold text-ctp-peach mt-2">
            {{ stats.reviewCount }} <span class="text-sm font-normal text-ctp-subtext0">题</span>
          </div>
          <p class="text-xs text-ctp-subtext0 mt-2">
            包含主动标记需要复习的题目及最近作答错误的题目。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
