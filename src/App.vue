<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useSession } from './app/session';
import { authClient } from './app/auth';
import ThemeSelector from './components/ThemeSelector.vue';

const route = useRoute();
const router = useRouter();
const session = useSession();

async function signOut() {
  await authClient.signOut();
  session.user = null;
  await router.replace('/login');
}
</script>

<template>
  <template v-if="route.meta.public">
    <RouterView />
  </template>
  <div v-else class="app-container min-h-screen flex flex-col bg-ctp-base text-ctp-text">
    <header
      class="topbar h-15 flex items-center justify-between px-6 bg-ctp-mantle border-b border-ctp-surface0 shrink-0 sticky top-0 z-30"
    >
      <div class="flex items-center gap-8">
        <RouterLink
          class="wordmark font-bold text-lg tracking-tight text-ctp-text flex items-center gap-1.5"
          to="/"
        >
          <span>11408</span>
          <span
            class="text-[11px] px-1.5 py-0.5 rounded bg-ctp-mauve text-ctp-crust font-bold tracking-wider uppercase"
          >
            STUDY
          </span>
        </RouterLink>
        <nav class="hidden sm:flex items-center gap-6 text-sm font-medium">
          <RouterLink
            to="/graph/math1"
            class="text-ctp-subtext0 hover:text-ctp-text transition-colors"
            active-class="text-ctp-mauve font-bold"
            >知识图谱</RouterLink
          >
          <RouterLink
            to="/study/math1.double-integral.definition"
            class="text-ctp-subtext0 hover:text-ctp-text transition-colors"
            active-class="text-ctp-mauve font-bold"
          >
            复习空间
          </RouterLink>
          <RouterLink
            to="/wrong-book"
            class="text-ctp-subtext0 hover:text-ctp-text transition-colors"
            active-class="text-ctp-mauve font-bold"
          >
            错题本
          </RouterLink>
          <RouterLink
            to="/statistics"
            class="text-ctp-subtext0 hover:text-ctp-text transition-colors"
            active-class="text-ctp-mauve font-bold"
          >
            数据统计
          </RouterLink>
          <RouterLink
            to="/settings"
            class="text-ctp-subtext0 hover:text-ctp-text transition-colors"
            active-class="text-ctp-mauve font-bold"
          >
            账户设置
          </RouterLink>
        </nav>
      </div>

      <div class="user-menu flex items-center gap-4 text-sm">
        <!-- Catppuccin 主题下拉选择器 -->
        <ThemeSelector />

        <div class="h-4 w-px bg-ctp-surface1 hidden sm:block"></div>

        <span class="hidden md:inline text-xs text-ctp-subtext1">{{
          session.user?.name || session.user?.email
        }}</span>
        <button
          class="text-xs px-3 py-1.5 rounded-lg border border-ctp-surface1 bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-text font-medium transition-colors cursor-pointer"
          @click="signOut"
        >
          退出
        </button>
      </div>
    </header>

    <div class="flex-1 min-w-0">
      <RouterView />
    </div>
  </div>
</template>
