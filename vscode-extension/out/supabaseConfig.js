"use strict";
// Supabase Configuration
// This file contains the Supabase client setup for AI task delegation feature
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabaseClient = getSupabaseClient;
exports.getEdgeFunctionUrl = getEdgeFunctionUrl;
exports.getSupabaseAnonKey = getSupabaseAnonKey;
exports.getSupabaseUrl = getSupabaseUrl;
exports.getPeerSuggestionEdgeFunctionUrl = getPeerSuggestionEdgeFunctionUrl;
const supabase_js_1 = require("@supabase/supabase-js");
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
let supabase = null;
function getSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('Supabase configuration is missing.');
    }
    if (!supabase) {
        supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabase;
}
function getEdgeFunctionUrl() {
    if (!EDGE_FUNCTION_URL) {
        throw new Error('EDGE_FUNCTION_URL is not configured.');
    }
    return EDGE_FUNCTION_URL;
}
function getSupabaseAnonKey() {
    if (!SUPABASE_ANON_KEY) {
        throw new Error('SUPABASE_ANON_KEY is not configured.');
    }
    return SUPABASE_ANON_KEY;
}
function getSupabaseUrl() {
    if (!SUPABASE_URL) {
        throw new Error('SUPABASE_URL is not configured.');
    }
    return SUPABASE_URL;
}
function getPeerSuggestionEdgeFunctionUrl() {
    if (!PEER_SUGGESTION_EDGE_FUNCTION_URL) {
        throw new Error('PEER_SUGGESTION_EDGE_FUNCTION_URL is not configured.');
    }
    return PEER_SUGGESTION_EDGE_FUNCTION_URL;
}
//# sourceMappingURL=supabaseConfig.js.map