-- Fix profiles with hardcoded "Thomas Ishida" name
-- This migration updates any profiles with "Thomas Ishida" to use proper defaults from auth.users

UPDATE public.profiles p
SET name = COALESCE(
    (SELECT au.raw_user_meta_data->>'full_name' FROM auth.users au WHERE au.id = p.id),
    (SELECT au.raw_user_meta_data->>'name' FROM auth.users au WHERE au.id = p.id),
    (SELECT SPLIT_PART(au.email, '@', 1) FROM auth.users au WHERE au.id = p.id),
    'User'
)
WHERE p.name = 'Thomas Ishida';

-- Also ensure any profile with empty/null name gets a proper default
UPDATE public.profiles p
SET name = COALESCE(
    (SELECT au.raw_user_meta_data->>'full_name' FROM auth.users au WHERE au.id = p.id),
    (SELECT au.raw_user_meta_data->>'name' FROM auth.users au WHERE au.id = p.id),
    (SELECT SPLIT_PART(au.email, '@', 1) FROM auth.users au WHERE au.id = p.id),
    'User'
)
WHERE p.name IS NULL OR p.name = '';

