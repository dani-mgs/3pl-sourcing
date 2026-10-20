// A stub of the Supabase query chains the tariff and landed-cost loaders use,
// answering from in-memory tables and applying eq/in/gt/like/likeAnyOf
// filters, order, range and limit. Counts the queries per table (one per
// from()). Moved from server-estimate.test.ts. Test-only.

type Row = Record<string, unknown>;

export type SupabaseStub = {
  // Pass where a Supabase client is expected.
  client: never;
  // Queries started per table.
  counts: Map<string, number>;
  // All queries started.
  total: () => number;
};

function likeRegex(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace(/%/g, ".*").replace(/_/g, ".")}$`);
}

export function createSupabaseStub(tables: Record<string, Row[]>, options: { failOn?: string } = {}): SupabaseStub {
  const counts = new Map<string, number>();
  const client = {
    from(table: string) {
      counts.set(table, (counts.get(table) ?? 0) + 1);
      const filters: ((row: Row) => boolean)[] = [];
      let max = Infinity;
      let orderBy: string | null = null;
      let window: [number, number] | null = null;
      const rows = () => {
        let result = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (orderBy) {
          const column = orderBy;
          result = [...result].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : String(a[column]) > String(b[column]) ? 1 : 0));
        }
        if (window) result = result.slice(window[0], window[1] + 1);
        return result.slice(0, max);
      };
      const answer = () =>
        options.failOn === table
          ? { data: null, error: { message: `relation "${table}" failed`, code: "XX000" } }
          : { data: rows(), error: null };
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push((r) => r[column] === value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((r) => values.includes(r[column]));
          return chain;
        },
        gt: (column: string, value: string) => {
          filters.push((r) => String(r[column]) > value);
          return chain;
        },
        like: (column: string, pattern: string) => {
          const regex = likeRegex(pattern);
          filters.push((r) => regex.test(String(r[column])));
          return chain;
        },
        likeAnyOf: (column: string, patterns: string[]) => {
          const regexes = patterns.map(likeRegex);
          filters.push((r) => regexes.some((regex) => regex.test(String(r[column]))));
          return chain;
        },
        order: (column: string) => {
          orderBy = column;
          return chain;
        },
        range: (from: number, to: number) => {
          window = [from, to];
          return chain;
        },
        limit: (n: number) => {
          max = n;
          return chain;
        },
        maybeSingle: async () => {
          const result = answer();
          return result.error ? result : { data: result.data![0] ?? null, error: null };
        },
        then: (resolve: (v: unknown) => void) => resolve(answer()),
      };
      return chain;
    },
  } as never;
  return { client, counts, total: () => [...counts.values()].reduce((a, b) => a + b, 0) };
}

// The client alone, for tests that don't count queries.
export function stubSupabase(tables: Record<string, Row[]>) {
  return createSupabaseStub(tables).client;
}
