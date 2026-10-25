import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Realtime-only client; null when keys are missing (the console then runs on mocks alone). */
export const supabase = url && key ? createClient(url, key) : null;
