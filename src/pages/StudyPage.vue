<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TopicTree from '../components/TopicTree.vue';
import NoteReader from '../components/NoteReader.vue';
import PracticeFilters from '../components/PracticeFilters.vue';
import PracticeScreen from '../components/PracticeScreen.vue';
import type { TopicTreeNode, PracticeSessionSummaryDto } from '../../shared/types';

const route = useRoute();
const router = useRouter();

const currentTopicId = computed(
  () => (route.params.topicId as string) || 'math1.double-integral.definition',
);
const currentTab = computed(() => (route.query.tab as string) || 'notes');
const activeSessionId = ref<string | null>(null);
const currentTopicTitle = ref('');
const isMobileSidebarOpen = ref(false);

const recentSessions = ref<PracticeSessionSummaryDto[]>([]);
const loadingSessions = ref(false);

function setTab(tab: 'notes' | 'practice') {
  router.push({
    path: `/study/${currentTopicId.value}`,
    query: { tab },
  });
}

function onSelectTopic(topic: TopicTreeNode) {
  currentTopicTitle.value = topic.title;
  router.push({
    path: `/study/${topic.id}`,
    query: { tab: currentTab.value },
  });
}

function onSessionCreated(sessionId: string) {
  router.push(`/practice/${sessionId}/1`);
}

function exitSession() {
  activeSessionId.value = null;
  loadRecentSessions();
}

async function loadRecentSessions() {
  loadingSessions.value = true;
  try {
    const res = await fetch('/api/v1/practice-sessions?limit=5');
    if (res.ok) {
      recentSessions.value = await res.json();
    }
  } catch {
    // 忽略异常
  } finally {
    loadingSessions.value = false;
  }
}

watch(
  () => route.params.topicId,
  () => {
    activeSessionId.value = null;
  },
);

onMounted(() => {
  loadRecentSessions();
});
</script>

<template>
  <div class="study-layout flex h-[calc(100vh-60px)] overflow-hidden bg-ctp-base text-ctp-text">
    <!-- 左侧树导航 -->
    <TopicTree
      :active-topic-id="currentTopicId"
      :is-open-mobile="isMobileSidebarOpen"
      @select-topic="onSelectTopic"
      @close-mobile="isMobileSidebarOpen = false"
    />

    <!-- 右侧主内容区 -->
    <main class="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <!-- 顶部二级主 Tab 与移动端抽屉开关 -->
      <div
        class="study-tabs-bar sticky top-0 z-20 flex items-center justify-between px-6 py-2.5 bg-ctp-mantle/90 backdrop-blur-xs border-b border-ctp-surface0"
      >
        <div class="flex items-center gap-3">
          <button
            class="md:hidden p-1.5 rounded-lg border border-ctp-surface1 text-ctp-subtext0 hover:bg-ctp-surface0 cursor-pointer"
            aria-label="打开目录"
            @click="isMobileSidebarOpen = true"
          >
            ☰ 目录
          </button>
          <div class="tabs flex rounded-lg p-1 bg-ctp-surface0 border border-ctp-surface1">
            <button
              class="px-4 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer"
              :class="
                currentTab === 'notes'
                  ? 'bg-ctp-mauve text-ctp-crust shadow-xs font-bold'
                  : 'text-ctp-subtext0 hover:text-ctp-text'
              "
              @click="setTab('notes')"
            >
              📖 知识点精讲
            </button>
            <button
              class="px-4 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer"
              :class="
                currentTab === 'practice'
                  ? 'bg-ctp-mauve text-ctp-crust shadow-xs font-bold'
                  : 'text-ctp-subtext0 hover:text-ctp-text'
              "
              @click="setTab('practice')"
            >
              ✍️ 习题演练
            </button>
          </div>
        </div>
      </div>

      <!-- 内容区根据 Tab 切换 -->
      <div class="p-4 sm:p-6 flex-1">
        <!-- 知识点模式 -->
        <template v-if="currentTab === 'notes'">
          <NoteReader
            :topic-id="currentTopicId"
            :topic-title="currentTopicTitle"
            @start-practice="setTab('practice')"
            @practice-question="setTab('practice')"
          />
        </template>

        <!-- 习题模式 -->
        <template v-else>
          <!-- 若有当前正在进行的练习 -->
          <PracticeScreen
            v-if="activeSessionId"
            :session-id="activeSessionId"
            @exit="exitSession"
          />

          <!-- 否则显示题组创建筛选器及历史练习记录 -->
          <div v-else class="space-y-8">
            <PracticeFilters
              :topic-id="currentTopicId"
              :topic-title="currentTopicTitle"
              @session-created="onSessionCreated"
            />

            <!-- 最近练习会话列表 -->
            <div v-if="recentSessions.length > 0" class="max-w-2xl mx-auto">
              <h3 class="text-sm font-semibold text-ctp-subtext1 uppercase tracking-wider mb-3">
                最近未完成或复习题组
              </h3>
              <div class="space-y-2">
                <div
                  v-for="sess in recentSessions"
                  :key="sess.id"
                  class="flex items-center justify-between p-3.5 bg-ctp-surface0 border border-ctp-surface1 rounded-xl shadow-xs hover:border-ctp-mauve transition-colors"
                >
                  <div>
                    <span
                      class="text-xs px-2 py-0.5 rounded-md font-medium mr-2"
                      :class="
                        sess.completedAt
                          ? 'bg-ctp-green/15 text-ctp-green border border-ctp-green/20'
                          : 'bg-ctp-yellow/15 text-ctp-yellow border border-ctp-yellow/20'
                      "
                    >
                      {{ sess.completedAt ? '已完成' : '进行中' }}
                    </span>
                    <span class="text-sm font-medium text-ctp-text"
                      >共 {{ sess.itemCount }} 题（已评 {{ sess.evaluatedCount }} 题）</span
                    >
                    <span class="block text-xs text-ctp-subtext0 mt-0.5">{{
                      new Date(sess.updatedAt).toLocaleString()
                    }}</span>
                  </div>
                  <button
                    class="px-3.5 py-1.5 bg-ctp-mauve hover:opacity-90 text-ctp-crust text-xs font-bold rounded-lg shadow-xs transition-opacity cursor-pointer"
                    @click="activeSessionId = sess.id"
                  >
                    {{ sess.completedAt ? '回顾答卷 →' : '继续练习 →' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>
