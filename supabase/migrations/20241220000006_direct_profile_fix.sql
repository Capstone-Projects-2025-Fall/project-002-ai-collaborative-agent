-- Generic fix for user profile creation
-- This creates profiles for all users in auth.users who don't have profiles yet
-- Uses generic approach - no hardcoded user IDs or names

-- Add missing columns to profiles table if they don't exist
-- These columns are used by the application code
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS programming_languages TEXT DEFAULT '';

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS willing_to_work_on TEXT DEFAULT '';

-- Create profiles for all authenticated users who don't have profiles yet
-- Note: Using user_id to match the initial schema structure
INSERT INTO public.profiles (user_id, name, skills, programming_languages, willing_to_work_on)
SELECT 
    au.id,
    COALESCE(
        au.raw_user_meta_data->>'full_name', 
        au.raw_user_meta_data->>'name', 
        SPLIT_PART(au.email, '@', 1),
        'User'
    ) as name,
    ARRAY[]::TEXT[] as skills,
    '' as programming_languages,
    '' as willing_to_work_on
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.user_id
WHERE p.user_id IS NULL;
