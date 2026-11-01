import { drizzle } from "drizzle-orm/d1";
import type { Bindings } from "../env.ts";
import * as schema from "./schema.ts";

export function database(env: Bindings) {
  return drizzle(env.DB, { schema });
}

export type Database = ReturnType<typeof database>;
