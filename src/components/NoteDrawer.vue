<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import NoteContent from './NoteContent.vue';

const props = defineProps<{ noteId: string | null }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const history = ref<string[]>([]);
const currentId = computed(() => history.value.at(-1));
let returnFocus: HTMLElement | null = null;
let previousOverflow: string | undefined;

function restorePage() {
  if (previousOverflow !== undefined) document.body.style.overflow = previousOverflow;
  previousOverflow = undefined;
  returnFocus?.focus();
  returnFocus = null;
}

watch(
  () => props.noteId,
  async (id) => {
    history.value = id ? [id] : [];
    await nextTick();
    if (id && dialog.value && !dialog.value.open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.value.showModal();
    } else if (!id) {
      dialog.value?.close();
      restorePage();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  dialog.value?.close();
  restorePage();
});
</script>

<template>
  <dialog
    ref="dialog"
    aria-label="考点笔记"
    class="note-drawer bg-ctp-base text-ctp-text border-l border-ctp-surface1"
    @cancel.prevent="emit('close')"
    @click="$event.target === $event.currentTarget && emit('close')"
  >
    <div
      class="sticky top-0 z-10 p-4 bg-ctp-mantle border-b border-ctp-surface1 flex items-center justify-between gap-3"
    >
      <div class="flex items-center gap-3">
        <span class="font-semibold">考点笔记</span>
        <button
          v-if="history.length > 1"
          class="text-sm text-ctp-mauve cursor-pointer"
          @click="history.pop()"
        >
          ← 上一篇
        </button>
      </div>
      <button
        aria-label="关闭考点笔记"
        class="px-3 py-2 rounded-lg bg-ctp-surface0 text-sm cursor-pointer"
        @click="emit('close')"
      >
        关闭 ✕
      </button>
    </div>
    <div class="p-5 sm:p-7">
      <NoteContent
        v-if="currentId"
        :note-id="currentId"
        :practice-enabled="false"
        @open-note="history.push($event)"
      />
    </div>
  </dialog>
</template>

<style scoped>
.note-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  margin: 0 0 0 auto;
  padding: 0;
  width: min(720px, 100vw);
  max-width: 100vw;
  height: 100dvh;
  max-height: 100dvh;
}
.note-drawer::backdrop {
  background: rgb(0 0 0 / 45%);
}
@media (max-width: 640px) {
  .note-drawer {
    width: 100vw;
  }
}
</style>
