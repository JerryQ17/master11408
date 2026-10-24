import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function sqlVal(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
  return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
}

export function interpolateSql(query: string, params: unknown[]): string {
  let idx = 0;
  return query.replace(/\?/g, () => {
    if (idx >= params.length) {
      throw new Error(`Parameter mismatch: expected at least ${idx + 1} parameters`);
    }
    return sqlVal(params[idx++]);
  });
}

export interface D1Statement {
  bind(...params: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean }>;
  getSql(): string;
}

export interface D1QueryResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface D1Adapter {
  prepare(query: string): D1Statement;
  batch(statements: (D1Statement | string)[]): Promise<unknown[]>;
  rawQuery(sql: string): Promise<D1QueryResult[]>;
}

export function createD1Adapter(options: { isRemote: boolean; env?: string }): D1Adapter {
  const wranglerBin = join(process.cwd(), 'node_modules/wrangler/bin/wrangler.js');
  const targetFlag = options.isRemote ? '--remote' : '--local';
  const envArgs = options.env ? ['--env', options.env] : [];

  function runSqlFile(sql: string): D1QueryResult[] {
    const tmpFile = join(tmpdir(), `d1-${randomUUID()}.sql`);
    writeFileSync(tmpFile, sql, 'utf8');
    try {
      const out = execFileSync(
        process.execPath,
        [
          wranglerBin,
          'd1',
          'execute',
          'DB',
          targetFlag,
          ...envArgs,
          '--json',
          '--yes',
          `--file=${tmpFile}`,
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            WRANGLER_LOG_PATH: '.wrangler/logs',
          },
        },
      );
      const s = out.indexOf('[');
      const e = out.lastIndexOf(']');
      if (s !== -1 && e !== -1) {
        return JSON.parse(out.slice(s, e + 1));
      }
      return [];
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        // ignore cleanup error
      }
    }
  }

  return {
    prepare(query: string) {
      let boundParams: unknown[] = [];
      const stmt: D1Statement = {
        bind(...params: unknown[]) {
          boundParams = params;
          return stmt;
        },
        async first<T = unknown>(): Promise<T | null> {
          const formatted = interpolateSql(query, boundParams);
          const res = runSqlFile(formatted);
          return (res[0]?.results?.[0] as T) ?? null;
        },
        async all<T = unknown>(): Promise<{ results: T[] }> {
          const formatted = interpolateSql(query, boundParams);
          const res = runSqlFile(formatted);
          return { results: (res[0]?.results as T[]) ?? [] };
        },
        async run(): Promise<{ success: boolean }> {
          const formatted = interpolateSql(query, boundParams);
          runSqlFile(formatted);
          return { success: true };
        },
        getSql(): string {
          return interpolateSql(query, boundParams);
        },
      };
      return stmt;
    },
    async batch(statements: (D1Statement | string)[]): Promise<unknown[]> {
      if (statements.length === 0) return [];
      const allSql = statements
        .map((s) => {
          const raw = typeof s === 'string' ? s.trim() : s.getSql().trim();
          return raw.endsWith(';') ? raw : `${raw};`;
        })
        .join('\n');
      return runSqlFile(allSql);
    },
    async rawQuery(sql: string) {
      return runSqlFile(sql);
    },
  };
}
