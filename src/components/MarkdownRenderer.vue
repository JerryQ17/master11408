<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

const props = withDefaults(
  defineProps<{
    content: string;
    questionLinksEnabled?: boolean;
  }>(),
  { questionLinksEnabled: true },
);

const emit = defineEmits<{
  (e: 'selectQuestion', questionId: string): void;
}>();

const renderedHtml = ref('');

const katexSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), 'className', 'style', 'ariaHidden'],
    span: [...(defaultSchema.attributes?.span || []), 'className', 'style'],
    code: [...(defaultSchema.attributes?.code || []), 'className'],
    math: ['xmlns'],
    annotation: ['encoding'],
    a: [...(defaultSchema.attributes?.a || []), 'dataQuestionId'],
  },
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'math',
    'semantics',
    'mrow',
    'mi',
    'mo',
    'mn',
    'msup',
    'msub',
    'mfrac',
    'mover',
    'munder',
    'msubsup',
    'mtext',
    'annotation',
  ],
};

function normalizeMath(text: string): string {
  if (!text || text.includes('$') || text.includes('`')) return text;
  const trimmed = text.trim();
  // 纯数学公式判定（例如 \pi, 2\pi, \frac{1}{4}, e^2, I_1 > I_2 等）
  if (/^(\d*\\|[a-zA-Z]_\d|[a-zA-Z]\^[0-9a-zA-Z])/.test(trimmed)) {
    return `$${trimmed}$`;
  }
  // 含有 LaTeX 命令的反斜杠公式
  if (/\\\w+/.test(text)) {
    return text.replace(
      /([0-9a-zA-Z^_()+\-=*/\s]*\\[a-zA-Z]+[0-9a-zA-Z^_()+\-=*/\\,\s{}]*)/g,
      (m) => {
        const t = m.trim();
        return t ? ` $${t}$ ` : m;
      },
    );
  }
  return text;
}

watchEffect(async () => {
  if (!props.content) {
    renderedHtml.value = '';
    return;
  }

  const mathNormalized = normalizeMath(props.content);

  // 将 :::question id=xyz 替换为受控例题链接
  const preprocessed = mathNormalized.replace(/:::question\s+id=([^\s]+)/g, (_, id) =>
    props.questionLinksEnabled === false
      ? `\n\n> 💡 **关联例题**：\`${id}\`\n\n`
      : `\n\n> 💡 **关联例题**：[\`${id}\` 前往练习该题 →](#question-${id})\n\n`,
  );

  try {
    const file = await unified()
      .use(remarkParse)
      .use(remarkMath)
      .use(remarkRehype)
      .use(rehypeHighlight, { detect: true })
      .use(rehypeKatex)
      .use(rehypeSanitize, katexSchema)
      .use(rehypeStringify)
      .process(preprocessed);

    renderedHtml.value = String(file);
  } catch (err) {
    renderedHtml.value = `<div class="error">渲染失败: ${(err as Error).message}</div>`;
  }
});

function handleClick(event: MouseEvent) {
  const target = (event.target as HTMLElement).closest('a');
  if (target) {
    const href = target.getAttribute('href');
    if (href?.startsWith('#question-')) {
      event.preventDefault();
      emit('selectQuestion', href.replace('#question-', ''));
    }
  }
}
</script>

<template>
  <div class="markdown-body overflow-x-auto" @click="handleClick" v-html="renderedHtml" />
</template>

<style>
.markdown-body {
  line-height: 1.7;
  color: var(--ctp-text);
}
.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4 {
  color: var(--ctp-lavender);
  font-weight: 600;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}
.markdown-body p {
  margin-bottom: 1em;
}
.markdown-body p:last-child {
  margin-bottom: 0;
}
.markdown-body a {
  color: var(--ctp-blue);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.markdown-body a:hover {
  color: var(--ctp-sapphire);
}
.markdown-body pre {
  background: var(--ctp-crust);
  color: var(--ctp-text);
  border: 1px solid var(--ctp-surface0);
  padding: 12px 16px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 14px;
}
.markdown-body code:not(pre code) {
  background: var(--ctp-surface0);
  color: var(--ctp-mauve);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}
.markdown-body ul,
.markdown-body ol {
  padding-left: 24px;
  margin-bottom: 1em;
}
.markdown-body li {
  margin-bottom: 0.3em;
}
.markdown-body blockquote {
  border-left: 4px solid var(--ctp-mauve);
  background: var(--ctp-mantle);
  padding: 10px 14px;
  border-radius: 0 8px 8px 0;
  color: var(--ctp-subtext1);
  margin: 1em 0;
}
.note-question-card {
  margin: 1.5em 0;
  padding: 12px 16px;
  background: var(--ctp-surface0);
  border: 1px solid var(--ctp-surface1);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.note-question-card .badge {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--ctp-mauve);
  color: var(--ctp-crust);
  border-radius: 4px;
  font-weight: 600;
}
.note-question-card .practice-btn {
  margin-left: auto;
  color: var(--ctp-mauve);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.note-question-card .practice-btn:hover {
  text-decoration: underline;
}
.katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 8px 0;
}
</style>
