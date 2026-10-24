import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import YAML from 'yaml';
import { createHash } from 'node:crypto';

export interface TopicItem {
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
  sortOrder?: number;
}

export interface TagItem {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder?: number;
  examYear?: number | null;
}

export interface NoteEntity {
  id: string;
  topicId: string;
  title: string;
  sortOrder: number;
  bodyMd: string;
  references: string[];
  contentHash: string;
  filePath: string;
}

export interface QuestionEntity {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'fill_blank' | 'written';
  difficulty: number;
  sourceKind: 'original' | 'exam' | 'reference';
  examYear: number | null;
  topics: string[];
  tags: string[];
  notes: string[];
  stemMd: string;
  options: { key: string; content: string }[] | null;
  answer: string | string[];
  explanationMd: string;
  contentHash: string;
  filePath: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  topics: Map<string, TopicItem>;
  tags: Map<string, TagItem>;
  notes: NoteEntity[];
  questions: QuestionEntity[];
}

export function parseQuestionSections(
  rawBody: string,
  filePath: string,
): { stemMd: string; explanationMd: string } {
  const lines = rawBody.split('\n');
  let inCodeBlock = false;
  let section: 'none' | 'stem' | 'explanation' = 'none';
  let stemCount = 0;
  let explanationCount = 0;
  const stemLines: string[] = [];
  const explanationLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }

    if (!inCodeBlock && trimmed.startsWith('## ')) {
      const heading = trimmed.slice(3).trim();
      if (heading === '题目') {
        stemCount++;
        section = 'stem';
        continue;
      } else if (heading === '解析') {
        explanationCount++;
        section = 'explanation';
        continue;
      } else {
        throw new Error(
          `${filePath}:${i + 1} 发现未知的二级标题 "## ${heading}"，题目必须恰好包含 "## 题目" 与 "## 解析"`,
        );
      }
    }

    if (section === 'stem') {
      stemLines.push(line);
    } else if (section === 'explanation') {
      explanationLines.push(line);
    }
  }

  if (stemCount !== 1) {
    throw new Error(`${filePath}: 缺少或存在多于一个 "## 题目" 分区（实际找到 ${stemCount} 个）`);
  }
  if (explanationCount !== 1) {
    throw new Error(
      `${filePath}: 缺少或存在多于一个 "## 解析" 分区（实际找到 ${explanationCount} 个）`,
    );
  }

  const stemMd = stemLines.join('\n').trim();
  const explanationMd = explanationLines.join('\n').trim();

  if (!stemMd) {
    throw new Error(`${filePath}: "## 题目" 分区内容不能为空`);
  }
  if (!explanationMd) {
    throw new Error(`${filePath}: "## 解析" 分区内容不能为空`);
  }

  return { stemMd, explanationMd };
}

export function computeContentHash(data: unknown): string {
  const normalized = typeof data === 'string' ? data : JSON.stringify(data);
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function parseNoteIds(
  value: unknown,
  field: string,
  filePath: string,
  errors: string[],
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id.trim())) {
    errors.push(`${filePath}: ${field} 必须是非空字符串 ID 数组`);
    return [];
  }
  const ids = value as string[];
  if (new Set(ids).size !== ids.length) errors.push(`${filePath}: ${field} 包含重复 ID`);
  return [...new Set(ids)].sort();
}

async function getFilesRecursively(dir: string, ext = '.md'): Promise<string[]> {
  const result: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        result.push(...(await getFilesRecursively(fullPath, ext)));
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        result.push(fullPath);
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  return result;
}

export async function validateContent(baseDir = 'content'): Promise<ValidationResult> {
  const errors: string[] = [];
  const topicsMap = new Map<string, TopicItem>();
  const tagsMap = new Map<string, TagItem>();
  const notesList: NoteEntity[] = [];
  const questionsList: QuestionEntity[] = [];

  // 1. 验证 topics.yaml
  const topicsPath = join(baseDir, 'topics.yaml');
  try {
    const topicsContent = await readFile(topicsPath, 'utf8');
    const topicsParsed = YAML.parse(topicsContent);
    if (!Array.isArray(topicsParsed)) {
      errors.push(`${topicsPath}: 内容必须是 YAML 列表`);
    } else {
      for (const t of topicsParsed) {
        if (!t.id || typeof t.id !== 'string') {
          errors.push(`${topicsPath}: 存在缺少有效 id 的 topic`);
          continue;
        }
        if (topicsMap.has(t.id)) {
          errors.push(`${topicsPath}: 重复的 topic id "${t.id}"`);
        }
        topicsMap.set(t.id, {
          id: t.id,
          parentId: t.parentId ?? null,
          slug: t.slug ?? t.id,
          title: t.title ?? t.id,
          sortOrder: t.sortOrder ?? 0,
        });
      }

      // 检查 topic 树结构与循环
      for (const [id, topic] of topicsMap) {
        if (topic.parentId) {
          if (!topicsMap.has(topic.parentId)) {
            errors.push(`${topicsPath}: topic "${id}" 的 parentId "${topic.parentId}" 不存在`);
          }
          // 循环检测
          const visited = new Set<string>([id]);
          let curr: string | null = topic.parentId;
          while (curr !== null) {
            if (visited.has(curr)) {
              errors.push(`${topicsPath}: topic "${id}" 存在循环引用链`);
              break;
            }
            visited.add(curr);
            curr = topicsMap.get(curr)?.parentId ?? null;
          }
        }
      }
    }
  } catch (err) {
    errors.push(`${topicsPath}: 读取或解析失败 - ${(err as Error).message}`);
  }

  // 2. 验证 tags.yaml
  const tagsPath = join(baseDir, 'tags.yaml');
  try {
    const tagsContent = await readFile(tagsPath, 'utf8');
    const tagsParsed = YAML.parse(tagsContent);
    if (!Array.isArray(tagsParsed)) {
      errors.push(`${tagsPath}: 内容必须是 YAML 列表`);
    } else {
      for (const t of tagsParsed) {
        if (!t.id || typeof t.id !== 'string') {
          errors.push(`${tagsPath}: 存在缺少有效 id 的 tag`);
          continue;
        }
        if (tagsMap.has(t.id)) {
          errors.push(`${tagsPath}: 重复的 tag id "${t.id}"`);
        }
        tagsMap.set(t.id, {
          id: t.id,
          parentId: t.parentId ?? null,
          name: t.name ?? t.id,
          slug: t.slug ?? t.id,
          sortOrder: t.sortOrder ?? 0,
          examYear: t.examYear ?? null,
        });
      }

      // 检查 tag 树结构与循环
      for (const [id, tag] of tagsMap) {
        if (tag.parentId) {
          if (!tagsMap.has(tag.parentId)) {
            errors.push(`${tagsPath}: tag "${id}" 的 parentId "${tag.parentId}" 不存在`);
          }
          const visited = new Set<string>([id]);
          let curr: string | null = tag.parentId;
          while (curr !== null) {
            if (visited.has(curr)) {
              errors.push(`${tagsPath}: tag "${id}" 存在循环引用链`);
              break;
            }
            visited.add(curr);
            curr = tagsMap.get(curr)?.parentId ?? null;
          }
        }
      }
    }
  } catch (err) {
    errors.push(`${tagsPath}: 读取或解析失败 - ${(err as Error).message}`);
  }

  // 3. 验证 notes
  const notesDir = join(baseDir, 'notes');
  const noteFiles = await getFilesRecursively(notesDir, '.md');
  const noteIds = new Set<string>();

  for (const filePath of noteFiles) {
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = matter(raw);
      const data = parsed.data;

      if (!data.id || typeof data.id !== 'string') {
        errors.push(`${filePath}: 缺少有效 frontmatter id`);
        continue;
      }
      if (noteIds.has(data.id)) {
        errors.push(`${filePath}: 存在重复的 note id "${data.id}"`);
      }
      noteIds.add(data.id);

      if (!data.topic || !topicsMap.has(data.topic)) {
        errors.push(`${filePath}: note 引用的 topic "${data.topic}" 不存在`);
      }

      const bodyMd = parsed.content.trim();
      const references = parseNoteIds(data.references, 'references', filePath, errors);
      if (!bodyMd) {
        errors.push(`${filePath}: 笔记内容正文不能为空`);
      }

      const hash = computeContentHash({
        id: data.id,
        topic: data.topic,
        title: data.title ?? '',
        bodyMd,
        references,
        order: data.order ?? 0,
      });

      notesList.push({
        id: data.id,
        topicId: data.topic,
        title: data.title ?? '未命名笔记',
        sortOrder: typeof data.order === 'number' ? data.order : 0,
        bodyMd,
        references,
        contentHash: hash,
        filePath,
      });
    } catch (err) {
      errors.push(`${filePath}: 解析笔记错误 - ${(err as Error).message}`);
    }
  }

  for (const note of notesList) {
    for (const id of note.references) {
      if (!noteIds.has(id)) errors.push(`${note.filePath}: references 引用的笔记 "${id}" 不存在`);
      if (id === note.id) errors.push(`${note.filePath}: references 不得引用笔记自身`);
    }
  }

  // 4. 验证 questions
  const questionsDir = join(baseDir, 'questions');
  const questionFiles = await getFilesRecursively(questionsDir, '.md');
  const questionIds = new Set<string>();

  for (const filePath of questionFiles) {
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = matter(raw);
      const data = parsed.data;

      if (!data.id || typeof data.id !== 'string') {
        errors.push(`${filePath}: 缺少有效 frontmatter id`);
        continue;
      }
      if (questionIds.has(data.id)) {
        errors.push(`${filePath}: 存在重复的 question id "${data.id}"`);
      }
      questionIds.add(data.id);

      const validTypes = ['single_choice', 'multiple_choice', 'fill_blank', 'written'];
      if (!validTypes.includes(data.type)) {
        errors.push(
          `${filePath}: 题目类型 "${data.type}" 无效，必须是 ${validTypes.join(', ')} 之一`,
        );
      }

      const difficulty = Number(data.difficulty ?? 1);
      if (isNaN(difficulty) || difficulty < 1 || difficulty > 5) {
        errors.push(`${filePath}: difficulty 必须是 1 到 5 的整数`);
      }

      const validSources = ['original', 'exam', 'reference'];
      if (!validSources.includes(data.source_kind)) {
        errors.push(`${filePath}: source_kind 必须是 ${validSources.join(', ')} 之一`);
      }

      let examYear: number | null = null;
      if (data.source_kind === 'exam') {
        if (typeof data.exam_year !== 'number' || data.exam_year < 1980 || data.exam_year > 2100) {
          errors.push(
            `${filePath}: 当 source_kind 为 exam 时，必须提供 1980-2100 间的有效 exam_year`,
          );
        } else {
          examYear = data.exam_year;
        }
      } else {
        if (data.exam_year !== undefined && data.exam_year !== null) {
          errors.push(`${filePath}: 当 source_kind 不为 exam 时，不得包含 exam_year`);
        }
      }

      if (!Array.isArray(data.topics) || data.topics.length === 0) {
        errors.push(`${filePath}: 必须关联至少一个 topic`);
      } else {
        for (const t of data.topics) {
          if (!topicsMap.has(t)) {
            errors.push(`${filePath}: 引用的 topic "${t}" 不存在`);
          }
        }
      }

      if (!Array.isArray(data.tags) || data.tags.length === 0) {
        errors.push(`${filePath}: 必须关联至少一个 tag`);
      } else {
        let tagExamYear: number | null = null;
        for (const tagId of data.tags) {
          const tagObj = tagsMap.get(tagId);
          if (!tagObj) {
            errors.push(`${filePath}: 引用的 tag "${tagId}" 不存在`);
          } else if (tagObj.examYear) {
            if (tagExamYear !== null && tagExamYear !== tagObj.examYear) {
              errors.push(
                `${filePath}: 题目不能同时关联多个冲突年份的标签（${tagExamYear} 与 ${tagObj.examYear}）`,
              );
            }
            tagExamYear = tagObj.examYear;
          }
        }
        if (tagExamYear !== null && examYear !== null && tagExamYear !== examYear) {
          errors.push(
            `${filePath}: 关联标签的年份 (${tagExamYear}) 与题目字段 exam_year (${examYear}) 不一致`,
          );
        }
      }

      // 验证 options 与 answer
      let optionsList: { key: string; content: string }[] | null = null;
      if (data.type === 'single_choice' || data.type === 'multiple_choice') {
        if (!Array.isArray(data.options) || data.options.length < 2 || data.options.length > 6) {
          errors.push(`${filePath}: 选择题选项必须是 2 至 6 个的有序数组`);
        } else {
          optionsList = [];
          const keys = new Set<string>();
          for (const opt of data.options) {
            if (!opt.key || !opt.content || typeof opt.key !== 'string') {
              errors.push(`${filePath}: 选项必须包含 key 和 content`);
            }
            if (keys.has(opt.key)) {
              errors.push(`${filePath}: 选项 key "${opt.key}" 重复`);
            }
            keys.add(opt.key);
            optionsList.push({ key: String(opt.key), content: String(opt.content) });
          }

          if (data.type === 'single_choice') {
            if (typeof data.answer !== 'string' || !keys.has(data.answer)) {
              errors.push(
                `${filePath}: 单选题 answer 必须是选项 key 之一（当前值：${data.answer}）`,
              );
            }
          } else if (data.type === 'multiple_choice') {
            if (!Array.isArray(data.answer) || data.answer.length === 0) {
              errors.push(`${filePath}: 多选题 answer 必须是非空数组`);
            } else {
              for (const ans of data.answer) {
                if (!keys.has(ans)) {
                  errors.push(`${filePath}: 多选题 answer 包含了不存在的选项 key "${ans}"`);
                }
              }
            }
          }
        }
      } else {
        // fill_blank / written
        if (typeof data.answer !== 'string' || !data.answer.trim()) {
          errors.push(`${filePath}: 主观题 answer 必须是非空参考答案字符串`);
        }
      }

      // 解析正文分区
      const { stemMd, explanationMd } = parseQuestionSections(parsed.content, filePath);
      const notes = parseNoteIds(data.notes, 'notes', filePath, errors);
      for (const id of notes) {
        if (!noteIds.has(id)) errors.push(`${filePath}: notes 引用的笔记 "${id}" 不存在`);
      }

      // 计算规范化 Revision Content Hash
      const hash = computeContentHash({
        id: data.id,
        type: data.type,
        difficulty,
        source_kind: data.source_kind,
        exam_year: examYear,
        stemMd,
        options: optionsList,
        answer: data.answer,
        explanationMd,
        notes,
      });

      questionsList.push({
        id: data.id,
        type: data.type,
        difficulty,
        sourceKind: data.source_kind,
        examYear,
        topics: data.topics,
        tags: data.tags,
        notes,
        stemMd,
        options: optionsList,
        answer: data.answer,
        explanationMd,
        contentHash: hash,
        filePath,
      });
    } catch (err) {
      errors.push(`${filePath}: ${(err as Error).message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    topics: topicsMap,
    tags: tagsMap,
    notes: notesList,
    questions: questionsList,
  };
}

// 当直接通过 Node 命令行运行时执行
if (process.argv[1]?.endsWith('content-validator.ts')) {
  validateContent()
    .then((res) => {
      if (res.valid) {
        console.log(
          `✅ 内容校验通过！包含 ${res.topics.size} 个主题、${res.tags.size} 个标签、${res.notes.length} 篇笔记、${res.questions.length} 道题目。`,
        );
        process.exit(0);
      } else {
        console.error(`❌ 内容校验失败（共 ${res.errors.length} 个错误）：`);
        for (const err of res.errors) {
          console.error(`  - ${err}`);
        }
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('执行校验脚本时发生未捕获异常：', err);
      process.exit(1);
    });
}
