"use strict";
// Supabase Configuration
// This file contains the Supabase client setup for AI task delegation feature
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabaseClient = getSupabaseClient;
exports.getEdgeFunctionUrl = getEdgeFunctionUrl;
exports.getSupabaseAnonKey = getSupabaseAnonKey;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = require("dotenv");
const path = __importStar(require("path"));
// Load environment variables from .env file
(0, dotenv_1.config)({ path: path.join(__dirname, '../../.env') });
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
//# sourceMappingURL=supabaseConfig.js.map