import type { Handoff } from "@nextmove/contracts";

/** Replace by id, or prepend a new handoff. Kept import-free of runtime code so node --test can run it. */
export const upsertHandoff = (list: Handoff[], h: Handoff): Handoff[] =>
  list.some((x) => x.id === h.id) ? list.map((x) => (x.id === h.id ? h : x)) : [h, ...list];
