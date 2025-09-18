import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv';   

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)