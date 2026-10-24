import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export function sqlVal(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') {
    if (Number.isNaN(val)) return 'NULL';
    return String(val);
  }
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

export interface D1QueryResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface D1Statement {
  bind(...params: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean }>;
  getSql(): string;
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

  function executeSql(sql: string): D1QueryResult[] {
    // Note: On remote D1, --file triggers ingestion/import mode which does NOT return query results.
    // Using --command queries the D1 API directly and returns row data.
    const args = [
      wranglerBin,
      'd1',
      'execute',
      'DB',
      targetFlag,
      ...envArgs,
      '--json',
      `--command=${sql}`,
    ];

    try {
      const out = execFileSync(process.execPath, args, {
        encoding: 'utf8',
        env: {
          ...process.env,
          WRANGLER_LOG_PATH: '.wrangler/logs',
        },
        maxBuffer: 50 * 1024 * 1024,
      });

      const s = out.indexOf('[');
      const e = out.lastIndexOf(']');
      if (s !== -1 && e !== -1) {
        return JSON.parse(out.slice(s, e + 1));
      }
      return [];
    } catch (err: unknown) {
      const execErr = err as {
        stdout?: string | Buffer;
        stderr?: string | Buffer;
        message?: string;
      };
      const stdout = execErr.stdout?.toString() || '';
      const stderr = execErr.stderr?.toString() || '';
      const combined = `${stdout}\n${stderr}`;
      const s = combined.indexOf('{');
      const e = combined.lastIndexOf('}');
      if (s !== -1 && e !== -1) {
        try {
          const errObj = JSON.parse(combined.slice(s, e + 1));
          if (errObj.error?.text) {
            throw new Error(`D1 Error: ${errObj.error.text}`, { cause: err });
          }
        } catch (jsonErr: unknown) {
          if (jsonErr instanceof Error && jsonErr.message.startsWith('D1 Error:')) {
            throw jsonErr;
          }
        }
      }
      throw err;
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
          const res = executeSql(formatted);
          return (res[0]?.results?.[0] as T) ?? null;
        },
        async all<T = unknown>(): Promise<{ results: T[] }> {
          const formatted = interpolateSql(query, boundParams);
          const res = executeSql(formatted);
          return { results: (res[0]?.results as T[]) ?? [] };
        },
        async run(): Promise<{ success: boolean }> {
          const formatted = interpolateSql(query, boundParams);
          executeSql(formatted);
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
      return executeSql(allSql);
    },
    async rawQuery(sql: string) {
      return executeSql(sql);
    },
  };
}
