/** What a customer types for their ID → the account ID: "vishwaa 2026", "vishwaa-2026" or "cust-vishwaa2026" all mean
 * "CUST-VISHWAA2026". Empty input stays empty. */
export const normalizeId = (raw: string) => {
  const id = raw.trim().toUpperCase().replace(/^CUST[-\s]*/, "").replace(/[\s_-]+/g, "");
  return id ? `CUST-${id}` : "";
};
