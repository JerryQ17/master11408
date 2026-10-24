<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import type { Core } from 'cytoscape';
import type { KnowledgeGraphDto, GraphNodeDto } from '../../shared/types';

const props = defineProps<{ graph: KnowledgeGraphDto; selectedId?: string; compact?: boolean }>();
const emit = defineEmits<{ select: [node: GraphNodeDto] }>();
const container = ref<HTMLDivElement>();
const error = ref('');
let cy: Core | undefined;
let resizeObserver: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined;
let disposed = false;

function applyTheme() {
  if (!cy || !container.value) return;
  const css = getComputedStyle(container.value);
  const color = (name: string) => css.getPropertyValue(`--ctp-${name}`).trim();
  cy.style()
    .selector('node')
    .style({
      'background-color': color('mauve'),
      color: color('text'),
      label: 'data(label)',
      'font-size': props.compact ? 12 : 14,
      'text-wrap': 'wrap',
      'text-overflow-wrap': 'anywhere',
      'text-max-width': '110px',
      'text-valign': 'bottom',
      'text-margin-y': 7,
      width: 24,
      height: 24,
    })
    .selector('node[kind = "question"]')
    .style({ 'background-color': color('teal'), shape: 'diamond', width: 18, height: 18 })
    .selector('edge')
    .style({
      width: 1.5,
      'line-color': color('overlay0'),
      'target-arrow-color': color('overlay0'),
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
    })
    .selector('edge[kind = "tests"]')
    .style({ 'line-style': 'dashed' })
    .selector('node:selected')
    .style({ 'border-color': color('peach'), 'border-width': 4 })
    .update();
}

function render() {
  if (!cy) return;
  cy.elements().remove();
  cy.add([
    ...props.graph.nodes.map((node) => ({
      data: {
        ...node,
        label: node.kind === 'question' ? `习题 · ${node.entityId.split('.').at(-1)}` : node.title,
      },
    })),
    ...props.graph.edges.map((edge) => ({ data: { ...edge } })),
  ]);
  cy.layout({
    name: 'concentric',
    animate: false,
    nodeDimensionsIncludeLabels: false,
    minNodeSpacing: 35,
    concentric: (node) => node.degree(),
    levelWidth: () => 1,
    padding: 45,
  }).run();
  fitGraph();
  selectCurrent();
}

function fitGraph() {
  if (!cy) return;
  cy.fit(undefined, 45);
  if (cy.zoom() > 1.25) cy.zoom(1.25);
  cy.center();
}

function selectCurrent() {
  cy?.nodes().unselect();
  if (props.selectedId) cy?.getElementById(props.selectedId).select();
}

onMounted(async () => {
  try {
    const { default: cytoscape } = await import('cytoscape');
    if (disposed || !container.value) return;
    cy = cytoscape({
      container: container.value,
      elements: [],
      minZoom: 0.15,
      maxZoom: 3,
    });
    cy.on('tap', 'node', (event) => {
      const node = props.graph.nodes.find((n) => n.id === event.target.id());
      if (node) emit('select', node);
    });
    applyTheme();
    render();
    resizeObserver = new ResizeObserver(() => {
      cy?.resize();
      fitGraph();
    });
    resizeObserver.observe(container.value);
    themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  } catch {
    error.value = '图形暂时无法加载，可以使用下方列表浏览关联。';
  }
});
watch(() => props.graph, render);
watch(() => props.selectedId, selectCurrent);
onBeforeUnmount(() => {
  disposed = true;
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  cy?.destroy();
});
</script>

<template>
  <div class="rounded-xl border border-ctp-surface1 bg-ctp-mantle overflow-hidden">
    <div
      class="flex items-center justify-between gap-3 px-4 py-3 border-b border-ctp-surface0 text-xs"
    >
      <span class="text-ctp-subtext0"
        >{{ graph.nodes.length }} 个节点 · {{ graph.edges.length }} 条关联</span
      >
      <button class="text-ctp-mauve cursor-pointer" @click="fitGraph">适应画布</button>
    </div>
    <p v-if="!graph.nodes.length" class="px-4 pt-4 text-sm text-ctp-subtext0">当前范围暂无笔记。</p>
    <p v-if="error" role="status" class="p-4 text-sm text-ctp-subtext0">{{ error }}</p>
    <div ref="container" aria-hidden="true" :class="compact ? 'h-64' : 'h-[55vh] min-h-80'" />
    <div class="px-4 pb-3 text-xs text-ctp-subtext0">
      ● 笔记 · ◆ 习题 · 实线：引用 → · 虚线：考查 →
    </div>
    <details class="border-t border-ctp-surface0 p-4 text-sm">
      <summary class="cursor-pointer text-ctp-subtext1">以列表浏览图谱</summary>
      <ul class="mt-3 space-y-2 max-h-64 overflow-y-auto">
        <li v-for="node in graph.nodes" :key="node.id">
          <button
            class="text-ctp-mauve text-left hover:underline cursor-pointer"
            :aria-label="`选择${node.kind === 'note' ? '笔记' : '习题'}：${node.title}`"
            @click="emit('select', node)"
          >
            {{ node.kind === 'note' ? '●' : '◆' }} {{ node.title }}
          </button>
        </li>
      </ul>
      <ul v-if="graph.edges.length" class="mt-3 space-y-1 text-xs text-ctp-subtext0">
        <li v-for="edge in graph.edges" :key="edge.id">
          {{ graph.nodes.find((n) => n.id === edge.source)?.title }}
          {{ edge.kind === 'reference' ? '引用' : '考查' }} →
          {{ graph.nodes.find((n) => n.id === edge.target)?.title }}
        </li>
      </ul>
    </details>
  </div>
</template>
