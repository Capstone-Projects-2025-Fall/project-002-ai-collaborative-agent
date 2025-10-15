"use strict";
// Supabase Configuration
// This file contains the Supabase client setup
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabaseClient = getSupabaseClient;
exports.getEdgeFunctionUrl = getEdgeFunctionUrl;
exports.getSupabaseAnonKey = getSupabaseAnonKey;
const supabase_js_1 = require("@supabase/supabase-js");
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ptthofpfrmhhmvmbzgxx.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0dGhvZnBmcm1oaG12bWJ6Z3h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjIzMTUsImV4cCI6MjA3MzY5ODMxNX0.vmIQd2JlfigERJTG5tkFGpoRgqBOj0FudEvGDzNd5Ko';
// Edge Function URL
const EDGE_FUNCTION_URL = 'https://ptthofpfrmhhmvmbzgxx.supabase.co/functions/v1/super-function';
// Create and export Supabase client
let supabase = null;
function getSupabaseClient() {
    if (!supabase) {
        supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabase;
}
function getEdgeFunctionUrl() {
    return EDGE_FUNCTION_URL;
}
function getSupabaseAnonKey() {
    return SUPABASE_ANON_KEY;
}
