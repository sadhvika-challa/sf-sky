import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export interface SpotSuggestionRow {
  name: string;
  location: string;
  notes: string | null;
  city: string;
}

export interface BugReportRow {
  description: string;
  page_context: string | null;
  user_agent: string | null;
}

export async function submitSpotSuggestion(row: SpotSuggestionRow): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('spot_suggestions').insert(row);
  return !error;
}

export async function submitBugReport(row: BugReportRow): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('bug_reports').insert(row);
  return !error;
}
