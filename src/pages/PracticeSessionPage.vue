<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PracticeScreen from '../components/PracticeScreen.vue';

const route = useRoute();
const router = useRouter();

const sessionId = computed(() => route.params.sessionId as string);
const ordinal = computed(() => Number(route.params.ordinal ?? 1));

function handleExit() {
  router.push('/study/math1.double-integral.definition?tab=practice');
}
</script>

<template>
  <div class="practice-page-container min-h-[calc(100vh-60px)] bg-ctp-base text-ctp-text py-4">
    <PracticeScreen
      v-if="sessionId"
      :session-id="sessionId"
      :initial-ordinal="ordinal"
      @exit="handleExit"
    />
  </div>
</template>
