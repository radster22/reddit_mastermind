import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnon;

export const supabaseClient = createClient(supabaseUrl, supabaseAnon);

export const supabaseAdmin = createClient(supabaseUrl, supabaseService);
