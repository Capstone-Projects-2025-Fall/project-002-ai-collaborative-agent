// Supabase Configuration
// This file contains the Supabase client setup for AI task delegation feature

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
config({ path: path.join(__dirname, '../../.env') });

// Get configuration from environment variables
// These should be set in a .env file in the project root
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const EDGE_FUNCTION_URL = process.env.EDGE_FUNCTION_URL;

// Validate configuration
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EDGE_FUNCTION_URL) {
  console.error('Missing Supabase configuration. Please set SUPABASE_URL, SUPABASE_ANON_KEY, and EDGE_FUNCTION_URL in your .env file');
}

// Create and export Supabase client
let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase configuration is missing. Please check your .env file.');
  }
  
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

export function getEdgeFunctionUrl(): string {
  if (!EDGE_FUNCTION_URL) {
    throw new Error('EDGE_FUNCTION_URL is not configured. Please check your .env file.');
  }
  return EDGE_FUNCTION_URL;
}

export function getSupabaseAnonKey(): string {
  if (!SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_ANON_KEY is not configured. Please check your .env file.');
  }
  return SUPABASE_ANON_KEY;
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

