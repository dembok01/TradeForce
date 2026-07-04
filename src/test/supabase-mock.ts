import { vi, type Mock } from "vitest";

// A chainable Supabase query-builder stub. Every non-terminal method returns
// the same builder; program the terminal ops (maybeSingle/single) per call
// with mockResolvedValueOnce. Enough to drive the EA route handlers' dedup +
// insert flow without a real database.
export type MockBuilder = {
  select: Mock;
  eq: Mock;
  is: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
  order: Mock;
  limit: Mock;
  gte: Mock;
  in: Mock;
  maybeSingle: Mock;
  single: Mock;
};

export function createMockServiceClient() {
  const builder = {} as MockBuilder;
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.is = vi.fn(chain);
  builder.insert = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.delete = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.gte = vi.fn(chain);
  builder.in = vi.fn(chain);
  builder.maybeSingle = vi.fn();
  builder.single = vi.fn();

  const from = vi.fn(() => builder);
  const client = { from } as unknown as ReturnType<
    typeof import("@/lib/supabase/service").createServiceClient
  >;
  return { client, builder, from };
}
