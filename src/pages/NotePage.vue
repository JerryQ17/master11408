<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createQuestionPractice } from '../app/knowledge';
import NoteContent from '../components/NoteContent.vue';

const route = useRoute();
const router = useRouter();
const noteId = computed(() => route.params.noteId as string);
const starting = ref(false);
const error = ref('');
async function practice(id: string) {
  if (starting.value) return;
  starting.value = true;
  error.value = '';
  try {
    await router.push(`/practice/${await createQuestionPractice(id)}/1`);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <main class="max-w-4xl mx-auto p-5 sm:p-8">
    <p v-if="starting" role="status" class="mb-4 text-ctp-subtext0">正在创建练习…</p>
    <p v-if="error" role="alert" class="mb-4 text-ctp-red">{{ error }}</p>
    <NoteContent
      :note-id="noteId"
      @open-note="router.push(`/notes/${$event}`)"
      @practice-question="practice"
    />
  </main>
</template>
