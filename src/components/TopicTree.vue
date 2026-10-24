<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { TopicTreeNode } from '../../shared/types';

defineProps<{
  activeTopicId?: string;
  isOpenMobile?: boolean;
}>();

const emit = defineEmits<{
  (e: 'selectTopic', topic: TopicTreeNode): void;
  (e: 'closeMobile'): void;
}>();

const treeData = ref<TopicTreeNode[]>([]);
const loading = ref(true);
const error = ref('');
const expandedIds = ref<Set<string>>(new Set());

// 从 localStorage 恢复展开状态
function loadExpandedState() {
  try {
    const saved = localStorage.getItem('expanded_topics');
    if (saved) {
      expandedIds.value = new Set(JSON.parse(saved));
    } else {
      // 默认展开所有顶层节点
      expandedIds.value = new Set([
        'math1',
        'math1.advanced-math',
        'math1.multivariable-calculus',
        'math1.double-integral',
        'cs408',
      ]);
    }
  } catch {
    // 忽略异常
  }
}

function saveExpandedState() {
  try {
    localStorage.setItem('expanded_topics', JSON.stringify([...expandedIds.value]));
  } catch {
    // 忽略异常
  }
}

function toggleExpand(id: string, event: Event) {
  event.stopPropagation();
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id);
  } else {
    expandedIds.value.add(id);
  }
  saveExpandedState();
}

async function fetchTree() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/v1/topics/tree');
    if (!res.ok) throw new Error('无法加载知识点树');
    treeData.value = await res.json();
    loadExpandedState();
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

function onNodeClick(node: TopicTreeNode) {
  emit('selectTopic', node);
  emit('closeMobile');
}

onMounted(() => {
  fetchTree();
});
</script>

<template>
  <aside
    class="sidebar bg-ctp-mantle border-r border-ctp-surface0"
    :class="{ 'mobile-open': isOpenMobile }"
  >
    <div class="sidebar-header flex items-center justify-between p-4 border-b border-ctp-surface0">
      <span class="text-xs font-bold tracking-wider text-ctp-subtext1 uppercase">复习导航</span>
      <button
        class="md:hidden text-ctp-subtext0 hover:text-ctp-text p-1 cursor-pointer"
        aria-label="关闭侧边栏"
        @click="$emit('closeMobile')"
      >
        ✕
      </button>
    </div>

    <div v-if="loading" class="p-4 text-xs text-ctp-subtext0">加载章节树中…</div>
    <div v-else-if="error" class="p-4 text-xs text-ctp-red">{{ error }}</div>

    <nav v-else class="tree-nav p-2 overflow-y-auto max-h-[calc(100vh-120px)]">
      <ul class="space-y-1">
        <template v-for="node in treeData" :key="node.id">
          <!-- 递归树项 -->
          <li class="tree-node">
            <RouterLink
              :to="`/graph/${node.id}`"
              class="block px-3 py-1 text-xs text-ctp-mauve hover:underline"
              >{{ node.title }} · 科目图谱 →</RouterLink
            >
            <div
              class="tree-item flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm cursor-pointer transition-colors"
              :class="{
                'bg-ctp-mauve text-ctp-crust font-bold shadow-2xs': activeTopicId === node.id,
                'hover:bg-ctp-surface0 text-ctp-text': activeTopicId !== node.id,
              }"
              @click="onNodeClick(node)"
            >
              <div class="flex items-center gap-1.5 truncate">
                <button
                  v-if="node.children.length > 0"
                  class="w-4 h-4 flex items-center justify-center text-xs opacity-75 hover:opacity-100 cursor-pointer"
                  @click="toggleExpand(node.id, $event)"
                >
                  {{ expandedIds.has(node.id) ? '▼' : '▶' }}
                </button>
                <span v-else class="w-4" />
                <span class="truncate">{{ node.title }}</span>
              </div>
              <span
                class="text-xs px-1.5 py-0.5 rounded-full ml-1 shrink-0 font-medium"
                :class="
                  activeTopicId === node.id
                    ? 'bg-ctp-crust/20 text-ctp-crust font-bold'
                    : 'bg-ctp-surface0 text-ctp-subtext0 border border-ctp-surface1'
                "
              >
                {{ node.questionCount }}
              </span>
            </div>

            <!-- 子节点递归展示 -->
            <ul
              v-if="node.children.length > 0 && expandedIds.has(node.id)"
              class="pl-4 mt-0.5 space-y-0.5 border-l border-ctp-surface0 ml-3"
            >
              <li v-for="child in node.children" :key="child.id">
                <div
                  class="tree-item flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm cursor-pointer transition-colors"
                  :class="{
                    'bg-ctp-mauve text-ctp-crust font-bold shadow-2xs': activeTopicId === child.id,
                    'hover:bg-ctp-surface0 text-ctp-text': activeTopicId !== child.id,
                  }"
                  @click="onNodeClick(child)"
                >
                  <div class="flex items-center gap-1.5 truncate">
                    <button
                      v-if="child.children.length > 0"
                      class="w-4 h-4 flex items-center justify-center text-xs opacity-75 hover:opacity-100 cursor-pointer"
                      @click="toggleExpand(child.id, $event)"
                    >
                      {{ expandedIds.has(child.id) ? '▼' : '▶' }}
                    </button>
                    <span v-else class="w-4" />
                    <span class="truncate">{{ child.title }}</span>
                  </div>
                  <span
                    class="text-xs px-1.5 py-0.5 rounded-full ml-1 shrink-0 font-medium"
                    :class="
                      activeTopicId === child.id
                        ? 'bg-ctp-crust/20 text-ctp-crust font-bold'
                        : 'bg-ctp-surface0 text-ctp-subtext0 border border-ctp-surface1'
                    "
                  >
                    {{ child.questionCount }}
                  </span>
                </div>

                <!-- 三级或更深子节点 -->
                <ul
                  v-if="child.children.length > 0 && expandedIds.has(child.id)"
                  class="pl-4 mt-0.5 space-y-0.5 border-l border-ctp-surface0 ml-3"
                >
                  <li v-for="grandchild in child.children" :key="grandchild.id">
                    <div
                      class="tree-item flex items-center justify-between px-2.5 py-1 rounded-lg text-sm cursor-pointer transition-colors"
                      :class="{
                        'bg-ctp-mauve text-ctp-crust font-bold shadow-2xs':
                          activeTopicId === grandchild.id,
                        'hover:bg-ctp-surface0 text-ctp-text': activeTopicId !== grandchild.id,
                      }"
                      @click="onNodeClick(grandchild)"
                    >
                      <span class="truncate">{{ grandchild.title }}</span>
                      <span
                        class="text-xs px-1.5 py-0.5 rounded-full ml-1 shrink-0 font-medium"
                        :class="
                          activeTopicId === grandchild.id
                            ? 'bg-ctp-crust/20 text-ctp-crust font-bold'
                            : 'bg-ctp-surface0 text-ctp-subtext0 border border-ctp-surface1'
                        "
                      >
                        {{ grandchild.questionCount }}
                      </span>
                    </div>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </template>
      </ul>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 280px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 50;
    transform: translateX(-100%);
    box-shadow: 2px 0 16px rgba(0, 0, 0, 0.3);
  }
  .sidebar.mobile-open {
    transform: translateX(0);
  }
}
</style>
