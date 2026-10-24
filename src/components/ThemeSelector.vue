<script setup lang="ts">
import {
  currentFlavor,
  setCatppuccinTheme,
  THEME_OPTIONS,
  type CatppuccinFlavor,
} from '../app/theme';

function onThemeChange(e: Event) {
  const select = e.target as HTMLSelectElement | null;
  if (select?.value) {
    setCatppuccinTheme(select.value as CatppuccinFlavor);
  }
}
</script>

<template>
  <div class="inline-flex items-center gap-1.5 text-xs text-ctp-subtext1">
    <label for="theme-selector" class="sr-only">选择 Catppuccin 主题</label>
    <span class="text-sm select-none" aria-hidden="true">🎨</span>
    <select
      id="theme-selector"
      :value="currentFlavor"
      class="bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-text border border-ctp-surface2 hover:border-ctp-mauve rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ctp-mauve/40 cursor-pointer shadow-2xs"
      title="选择 Catppuccin 主题风格"
      @change="onThemeChange"
    >
      <option
        v-for="opt in THEME_OPTIONS"
        :key="opt.id"
        :value="opt.id"
        class="bg-ctp-surface0 text-ctp-text py-1"
      >
        {{ opt.badge }} · {{ opt.name }}
      </option>
    </select>
  </div>
</template>
