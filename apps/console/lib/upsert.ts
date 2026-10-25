/** Replace by id, or prepend a new item (handoffs, traces). Kept import-free of runtime code so node --test can run it. */
export const upsertById = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list];
