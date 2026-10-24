<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authClient } from '../app/auth';
import { useSession } from '../app/session';
import ThemeSelector from '../components/ThemeSelector.vue';

const route = useRoute();
const router = useRouter();
const session = useSession();

// 从 URL Hash 中提取一次性邀请凭证
const rawToken =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.hash.slice(1)).get('token')
    : null;
const token = ref<string | null>(rawToken);
const isEnrollment = ref<boolean>(route.path === '/enroll' || !!rawToken);
const enrollment = computed(() => isEnrollment.value);

// 核心优化：如果处于注册/邀请流程中，立即将地址栏静默重写为纯净根路径 '/' (即 http://localhost:5173/)
// 这样当 Bitwarden、1Password 或系统原生 Passkey 保存凭据时，会将 URI 自动记录为根域名 http://localhost:5173
// 而不会附带临时的 /enroll 路径，彻底杜绝后续退出到 /login 时密码管理器提示“未找到此网站通行密钥”的问题！
if (typeof window !== 'undefined' && (rawToken || route.path === '/enroll')) {
  window.history.replaceState(null, '', '/');
}

watch(
  () => route.path,
  (newPath) => {
    if (newPath === '/login') {
      isEnrollment.value = false;
      token.value = null;
    }
  },
);

const name = ref('我的设备');
const busy = ref(false);
const error = ref('');

async function signIn() {
  busy.value = true;
  error.value = '';
  try {
    const result = enrollment.value
      ? await authClient.passkey.addPasskey({
          name: name.value,
          context: token.value,
          createSession: true,
        })
      : await authClient.signIn.passkey();
    if (result.error) throw new Error(result.error.message ?? '无法完成设备验证，请重试');
    await session.load();
    const target =
      typeof route.query.redirect === 'string' &&
      route.query.redirect.startsWith('/') &&
      !route.query.redirect.startsWith('//')
        ? route.query.redirect
        : '/';
    await router.replace(target);
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : '登录失败，请重试';
    // 友善化处理浏览器原生 WebAuthn 取消提示
    if (msg.includes('cancelled') || msg.includes('canceled') || msg.includes('AbortError')) {
      error.value = '您取消了生物识别/设备验证，可随时点击下方按钮重新尝试。';
    } else {
      error.value = msg;
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div
    class="min-h-screen bg-ctp-base text-ctp-text flex flex-col justify-between selection:bg-ctp-mauve/20"
  >
    <!-- 顶部 Brand Bar & 主题切换 -->
    <header class="w-full px-6 py-5 max-w-6xl mx-auto flex items-center justify-between">
      <RouterLink
        to="/"
        class="group flex items-center gap-2 font-bold text-lg tracking-tight text-ctp-text"
      >
        <span>11408</span>
        <span
          class="text-[11px] tracking-widest font-semibold px-1.5 py-0.5 rounded bg-ctp-mauve text-ctp-crust uppercase group-hover:opacity-90 transition-opacity"
        >
          STUDY
        </span>
      </RouterLink>

      <div class="flex items-center gap-4">
        <!-- Catppuccin 主题下拉列表 -->
        <ThemeSelector />

        <div class="hidden sm:flex items-center gap-2 text-xs font-medium text-ctp-subtext0">
          <span class="w-2 h-2 rounded-full bg-ctp-green inline-block animate-pulse"></span>
          <span>Passkey 硬件免密</span>
        </div>
      </div>
    </header>

    <!-- 中间核心 Hero & 认证卡片 -->
    <main class="w-full max-w-6xl mx-auto px-6 py-8 sm:py-14 flex-1 flex items-center">
      <div class="w-full grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
        <!-- 左侧：文案与学科定位 -->
        <section class="lg:col-span-7 space-y-6">
          <div
            class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ctp-surface0 border border-ctp-surface1 text-ctp-subtext1 text-xs font-semibold tracking-wider uppercase"
          >
            <span class="text-ctp-mauve">✦</span> A LITTLE, EVERY DAY
          </div>

          <h1
            class="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-ctp-text leading-none"
          >
            日日有进<span class="text-ctp-mauve">。</span>
          </h1>

          <p class="text-lg sm:text-2xl text-ctp-subtext0 font-normal leading-relaxed">
            把知识连成体系，<br class="hidden sm:inline" />
            把练习留在日常。
          </p>

          <!-- 四门学科标签 (Catppuccin 优雅胶囊) -->
          <div class="flex flex-wrap gap-2.5 pt-2">
            <span
              class="px-3.5 py-1.5 rounded-lg bg-ctp-surface0 border border-ctp-surface1 text-xs font-medium text-ctp-mauve shadow-2xs"
            >
              政治
            </span>
            <span
              class="px-3.5 py-1.5 rounded-lg bg-ctp-surface0 border border-ctp-surface1 text-xs font-medium text-ctp-sapphire shadow-2xs"
            >
              英语一
            </span>
            <span
              class="px-3.5 py-1.5 rounded-lg bg-ctp-surface0 border border-ctp-surface1 text-xs font-medium text-ctp-blue shadow-2xs"
            >
              数学一
            </span>
            <span
              class="px-3.5 py-1.5 rounded-lg bg-ctp-surface0 border border-ctp-surface1 text-xs font-medium text-ctp-teal shadow-2xs"
            >
              408 计算机学科专业基础
            </span>
          </div>

          <!-- 备考三大设计原则 -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-ctp-surface0">
            <div class="space-y-1">
              <span class="text-sm font-semibold text-ctp-text flex items-center gap-1.5">
                <span class="text-ctp-green">🌲</span> 树形知识点
              </span>
              <p class="text-xs text-ctp-subtext0 leading-relaxed">
                四科大纲分层拆解，Markdown与LaTeX公式清晰排版。
              </p>
            </div>
            <div class="space-y-1">
              <span class="text-sm font-semibold text-ctp-text flex items-center gap-1.5">
                <span class="text-ctp-peach">✍️</span> 单屏单题练
              </span>
              <p class="text-xs text-ctp-subtext0 leading-relaxed">
                客观题即时判定，主观题先揭示再自评，支持快捷键。
              </p>
            </div>
            <div class="space-y-1">
              <span class="text-sm font-semibold text-ctp-text flex items-center gap-1.5">
                <span class="text-ctp-mauve">📊</span> 严谨错题本
              </span>
              <p class="text-xs text-ctp-subtext0 leading-relaxed">
                区分最近做错、曾经做错与独立手动复习，指标口径明确。
              </p>
            </div>
          </div>
        </section>

        <!-- 右侧：认证卡片 -->
        <section class="lg:col-span-5 flex justify-center">
          <div
            class="w-full max-w-md bg-ctp-surface0 border border-ctp-surface1 rounded-2xl p-7 sm:p-9 shadow-xl shadow-black/10 space-y-6"
          >
            <!-- 卡片图标与标题 -->
            <div class="space-y-3">
              <div
                class="w-12 h-12 rounded-xl bg-ctp-surface1 text-ctp-mauve flex items-center justify-center text-xl font-bold shadow-2xs border border-ctp-surface2"
                aria-hidden="true"
              >
                ⌘
              </div>
              <div>
                <p class="text-[11px] font-semibold tracking-wider text-ctp-subtext1 uppercase">
                  YOUR PERSONAL STUDY SPACE
                </p>
                <h2 class="text-2xl font-bold text-ctp-text mt-0.5">
                  {{ enrollment ? '开始你的学习旅程' : '欢迎回来' }}
                </h2>
                <p class="text-sm text-ctp-subtext0 mt-1 leading-relaxed">
                  {{
                    enrollment
                      ? '通过管理员签发的一次性邀请，绑定用于登录的设备 Passkey。'
                      : '使用设备上的指纹、面容或 PIN 安全免密登录。'
                  }}
                </p>
              </div>
            </div>

            <!-- 登录/绑定表单 -->
            <form class="space-y-4" @submit.prevent="signIn">
              <div v-if="enrollment" class="space-y-1.5">
                <label for="device-name-input" class="block text-xs font-semibold text-ctp-text">
                  设备名称
                </label>
                <input
                  id="device-name-input"
                  v-model="name"
                  maxlength="64"
                  required
                  placeholder="例如：主力笔记本、iPad Pro"
                  class="w-full px-3.5 py-2.5 rounded-lg border border-ctp-surface1 bg-ctp-mantle text-sm text-ctp-text placeholder-ctp-overlay0 focus:outline-none focus:ring-2 focus:ring-ctp-mauve/30 focus:border-ctp-mauve transition-all"
                />
              </div>

              <!-- 缺少邀请码警告 -->
              <div
                v-if="enrollment && !token"
                class="p-3.5 rounded-lg bg-ctp-peach/10 border border-ctp-peach/30 text-ctp-peach text-xs leading-relaxed"
                role="alert"
              >
                ⚠️ <strong>缺少有效邀请凭证</strong><br />
                请重新打开管理员提供的完整邀请链接（链接中包含
                <code class="font-mono text-ctp-peach underline">#token=...</code>）。
              </div>

              <!-- 错误提示 -->
              <div
                v-if="error"
                class="p-3.5 rounded-lg bg-ctp-red/10 border border-ctp-red/30 text-ctp-red text-xs leading-relaxed flex items-start gap-2"
                role="alert"
              >
                <span class="shrink-0 font-bold">✕</span>
                <span class="flex-1">{{ error }}</span>
              </div>

              <!-- 核心提交按钮 -->
              <button
                type="submit"
                class="w-full py-3 px-4 rounded-xl font-bold text-sm text-ctp-crust bg-ctp-mauve hover:opacity-90 active:scale-[0.99] shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                :disabled="busy || (enrollment && !token)"
              >
                <span
                  v-if="busy"
                  class="w-4 h-4 border-2 border-ctp-crust/30 border-t-ctp-crust rounded-full animate-spin"
                ></span>
                <span>
                  {{
                    busy
                      ? '正在等待设备验证…'
                      : enrollment
                        ? '创建 Passkey 并进入'
                        : '使用 Passkey 登录'
                  }}
                </span>
                <span v-if="!busy" aria-hidden="true">↗</span>
              </button>
            </form>

            <!-- 底部说明与切换链接 -->
            <div class="pt-2 border-t border-ctp-surface1 text-center space-y-2">
              <p class="text-xs text-ctp-subtext0 leading-relaxed">
                无需记忆复杂密码。系统采用 WebAuthn
                硬件凭证防护，首次使用请向管理员获取一次性注册邀请。
              </p>
              <div v-if="enrollment">
                <RouterLink
                  to="/login"
                  class="text-xs font-semibold text-ctp-mauve hover:underline transition-colors"
                >
                  已有绑定的 Passkey？直接登录 →
                </RouterLink>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>

    <!-- 底部典雅页脚 -->
    <footer
      class="w-full border-t border-ctp-surface0 py-6 px-6 text-center text-xs text-ctp-subtext0"
    >
      <p class="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3">
        <span>一点一滴，走向更笃定的自己。</span>
        <span class="hidden sm:inline">·</span>
        <span class="font-semibold text-ctp-subtext1">11408 · 日日有进</span>
      </p>
    </footer>
  </div>
</template>
