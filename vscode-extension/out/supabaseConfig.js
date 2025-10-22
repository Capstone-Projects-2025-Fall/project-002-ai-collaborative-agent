"use strict";
// Supabase Configuration
// This file contains the Supabase client setup for AI task delegation feature
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabaseClient = getSupabaseClient;
exports.getEdgeFunctionUrl = getEdgeFunctionUrl;
exports.getSupabaseAnonKey = getSupabaseAnonKey;
const supabase_js_1 = require("@supabase/supabase-js");
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
let supabase = null;
function getSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('Supabase configuration is missing. Please check your .env file.');
    }
    if (!supabase) {
        supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabase;
}
function getEdgeFunctionUrl() {
    if (!EDGE_FUNCTION_URL) {
        throw new Error('EDGE_FUNCTION_URL is not configured. Please check your .env file.');
    }
    return EDGE_FUNCTION_URL;
}
function getSupabaseAnonKey() {
    if (!SUPABASE_ANON_KEY) {
        throw new Error('SUPABASE_ANON_KEY is not configured. Please check your .env file.');
    }
    return SUPABASE_ANON_KEY;
}
