// Supabase Configuration
// This file contains the Supabase client setup

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ptthofpfrmhhmvmbzgxx.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0dGhvZnBmcm1oaG12bWJ6Z3h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjIzMTUsImV4cCI6MjA3MzY5ODMxNX0.vmIQd2JlfigERJTG5tkFGpoRgqBOj0FudEvGDzNd5Ko';

// Edge Function URL
const EDGE_FUNCTION_URL = 'https://ptthofpfrmhhmvmbzgxx.supabase.co/functions/v1/super-function';

// Create and export Supabase client
let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

export function getEdgeFunctionUrl(): string {
  return EDGE_FUNCTION_URL;
}

export function getSupabaseAnonKey(): string {
  return SUPABASE_ANON_KEY;
}

// Database Types (for TypeScript type safety)
export interface User {
  id?: string;
  name: string;
  skills: string;
  programming_languages: string;
  willing_to_work_on?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Project {
  id?: string;
  name: string;
  description: string;
  goals?: string;
  requirements?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectMember {
  id?: string;
  project_id: string;
  user_id: string;
  created_at?: string;
}

export interface AIPrompt {
  id?: string;
  project_id: string;
  prompt_content: string;
  ai_response?: string;
  created_at?: string;
}

export interface ProjectWithMembers extends Project {
  selectedMemberIds?: string[];
}
