<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { authClient } from '../app/auth';
import { currentFlavor, setCatppuccinTheme, THEME_OPTIONS } from '../app/theme';

const credentials = ref<{ id: string; name?: string | null }[]>([]);
const name = ref('备用设备');
const error = ref('');
const busy = ref(false);

async function load() {
  const response = await authClient.passkey.listUserPasskeys();
  if (response.error) throw new Error(response.error.message);
  credentials.value = response.data ?? [];
}

async function change(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = '';
  try {
    await action();
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失败';
  } finally {
    busy.value = false;
  }
}

async function add() {
  const result = await authClient.passkey.addPasskey({ name: name.value });
  if (result.error) throw new Error(result.error.message);
}

async function remove(id: string) {
  if (!window.confirm('删除这枚 Passkey？请确认另一枚可用于登录。')) return;
  const result = await authClient.passkey.deletePasskey({ id });
  if (result.error) throw new Error(result.error.message);
}

onMounted(() => change(async () => {}));
</script>

<template>
  <div class="max-w-3xl mx-auto py-10 px-4 sm:px-6 space-y-8">
    <!-- 页面标题 -->
    <div class="pb-6 border-b border-ctp-surface0">
      <span class="text-xs font-semibold text-ctp-subtext1 uppercase tracking-wider"
        >YOUR ACCOUNT & SETTINGS</span
      >
      <h1 class="text-3xl font-bold text-ctp-text mt-1">账户与偏好</h1>
      <p class="text-sm text-ctp-subtext0 mt-1.5 leading-relaxed">
        基于 WebAuthn Passkey 硬件级免密认证与 Catppuccin 全局主题偏好配置。
      </p>
    </div>

    <!-- 错误横幅 -->
    <div
      v-if="error"
      class="p-4 bg-ctp-red/10 text-ctp-red rounded-xl border border-ctp-red/30 text-sm flex items-start gap-2.5"
      role="alert"
    >
      <span class="font-bold">✕</span>
      <span class="flex-1">{{ error }}</span>
    </div>

    <!-- 主题偏好设置卡片 (Catppuccin 4 Flavour Picker) -->
    <div
      class="bg-ctp-surface0 border border-ctp-surface1 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5"
    >
      <div class="flex items-center justify-between pb-4 border-b border-ctp-surface1">
        <div>
          <h2 class="text-lg font-bold text-ctp-text flex items-center gap-2">
            <span>🎨</span> Catppuccin 视觉主题
          </h2>
          <p class="text-xs text-ctp-subtext0 mt-0.5">
            官方提供的四套经典配色体系，随心切换明暗模式。
          </p>
        </div>
        <span class="px-2.5 py-1 rounded-full bg-ctp-surface1 text-ctp-mauve text-xs font-semibold">
          当前：{{ THEME_OPTIONS.find((t) => t.id === currentFlavor)?.name }}
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          v-for="opt in THEME_OPTIONS"
          :key="opt.id"
          type="button"
          class="p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3"
          :class="
            currentFlavor === opt.id
              ? 'border-ctp-mauve ring-2 ring-ctp-mauve/30 bg-ctp-surface1'
              : 'border-ctp-surface1 bg-ctp-mantle hover:border-ctp-surface2 hover:bg-ctp-surface1/60'
          "
          @click="setCatppuccinTheme(opt.id)"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-ctp-text">{{ opt.name }}</span>
            <span
              class="w-3.5 h-3.5 rounded-full border border-white/20"
              :style="{ backgroundColor: opt.accentHex }"
            ></span>
          </div>
          <div>
            <p class="text-[11px] text-ctp-subtext0">{{ opt.badge }}</p>
            <div class="mt-2 flex gap-1 items-center">
              <span
                class="w-4 h-4 rounded-xs border border-ctp-surface2"
                :style="{ backgroundColor: opt.bgHex }"
                title="Base"
              ></span>
              <span
                class="w-4 h-4 rounded-xs border border-ctp-surface2"
                :style="{ backgroundColor: opt.accentHex }"
                title="Accent"
              ></span>
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- 登录凭证卡片 -->
    <div
      class="bg-ctp-surface0 border border-ctp-surface1 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6"
    >
      <div class="flex items-center justify-between pb-4 border-b border-ctp-surface1">
        <div>
          <h2 class="text-lg font-bold text-ctp-text">登录凭证</h2>
          <p class="text-xs text-ctp-subtext0 mt-0.5">
            当前账户已绑定的硬件认证设备列表（系统要求必须保留至少 1 枚）。
          </p>
        </div>
        <span class="px-2.5 py-1 rounded-full bg-ctp-surface1 text-ctp-green text-xs font-semibold">
          {{ credentials.length }} 枚活跃
        </span>
      </div>

      <!-- 凭证列表 -->
      <div class="space-y-3">
        <div
          v-for="credential in credentials"
          :key="credential.id"
          class="flex items-center justify-between p-4 rounded-xl border border-ctp-surface1 bg-ctp-mantle hover:border-ctp-mauve/40 transition-colors"
        >
          <div class="flex items-center gap-3">
            <span
              class="w-9 h-9 rounded-lg bg-ctp-surface0 border border-ctp-surface1 flex items-center justify-center text-sm font-semibold text-ctp-mauve shadow-2xs"
            >
              💻
            </span>
            <div>
              <p class="text-sm font-semibold text-ctp-text">
                {{ credential.name || '未命名设备' }}
              </p>
              <p class="text-[11px] text-ctp-subtext0 font-mono mt-0.5">
                ID: {{ credential.id.slice(0, 16) }}…
              </p>
            </div>
          </div>

          <button
            class="px-3 py-1.5 rounded-lg border border-ctp-surface1 bg-ctp-surface0 text-xs font-medium text-ctp-red hover:bg-ctp-red/10 hover:border-ctp-red/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            :disabled="busy || credentials.length <= 1"
            :title="credentials.length <= 1 ? '系统限制：至少保留一枚登录凭证' : '移除此设备'"
            @click="change(() => remove(credential.id))"
          >
            删除
          </button>
        </div>
      </div>

      <!-- 添加新凭证表单 -->
      <div class="pt-4 border-t border-ctp-surface1">
        <h3 class="text-xs font-semibold text-ctp-subtext1 uppercase tracking-wider mb-3">
          添加新的 Passkey 设备
        </h3>
        <form
          class="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end"
          @submit.prevent="change(add)"
        >
          <div class="flex-1 space-y-1.5">
            <label for="new-device-name" class="block text-xs font-semibold text-ctp-text">
              新设备名称
            </label>
            <input
              id="new-device-name"
              v-model="name"
              required
              maxlength="64"
              placeholder="例如：备用手机、iPad、硬件密钥 YubiKey"
              class="w-full px-3.5 py-2.5 rounded-lg border border-ctp-surface1 bg-ctp-mantle text-sm text-ctp-text placeholder-ctp-overlay0 focus:outline-none focus:ring-2 focus:ring-ctp-mauve/30 focus:border-ctp-mauve transition-all"
            />
          </div>
          <button
            type="submit"
            class="px-5 py-2.5 rounded-lg bg-ctp-mauve hover:opacity-90 text-ctp-crust text-sm font-bold shadow-xs transition-opacity disabled:opacity-50 cursor-pointer"
            :disabled="busy"
          >
            {{ busy ? '正在处理…' : '＋ 添加 Passkey' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
