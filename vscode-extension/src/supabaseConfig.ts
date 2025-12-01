// Supabase Configuration
// This file contains the Supabase client setup for AI task delegation feature

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Hardcoded Supabase configuration
const SUPABASE_URL = 'https://ptthofpfrmhhmvmbzgxx.supabase.co/';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0dGhvZnBmcm1oaG12bWJ6Z3h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjIzMTUsImV4cCI6MjA3MzY5ODMxNX0.vmIQd2JlfigERJTG5tkFGpoRgqBOj0FudEvGDzNd5Ko';
const EDGE_FUNCTION_URL = 'https://ptthofpfrmhhmvmbzgxx.supabase.co/functions/v1/super-function';
const PEER_SUGGESTION_EDGE_FUNCTION_URL = 'https://ptthofpfrmhhmvmbzgxx.supabase.co/functions/v1/suggest-peer';

// Validate configuration
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EDGE_FUNCTION_URL) {
  console.error('Missing Supabase configuration.');
}

// Create and export Supabase client
let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase configuration is missing.');
  }
  
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

export function getEdgeFunctionUrl(): string {
  if (!EDGE_FUNCTION_URL) {
    throw new Error('EDGE_FUNCTION_URL is not configured.');
  }
  return EDGE_FUNCTION_URL;
}

export function getSupabaseAnonKey(): string {
  if (!SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_ANON_KEY is not configured.');
  }
  return SUPABASE_ANON_KEY;
}

export function getSupabaseUrl(): string {
  if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL is not configured.');
  }
  return SUPABASE_URL;
}

export function getPeerSuggestionEdgeFunctionUrl(): string {
  if (!PEER_SUGGESTION_EDGE_FUNCTION_URL) {
    throw new Error('PEER_SUGGESTION_EDGE_FUNCTION_URL is not configured.');
  }
  return PEER_SUGGESTION_EDGE_FUNCTION_URL;
}

// Database Types
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

