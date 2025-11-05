-- Generic fix for user profile creation
-- This creates profiles for all users in auth.users who don't have profiles yet
-- Uses generic approach - no hardcoded user IDs or names
INSERT INTO public.profiles (id, name, skills, programming_languages, willing_to_work_on)
SELECT 
    au.id,
    COALESCE(
        au.raw_user_meta_data->>'full_name', 
        au.raw_user_meta_data->>'name', 
        SPLIT_PART(au.email, '@', 1),
        'User'
    ) as name,
    '' as skills,
    '' as programming_languages,
    '' as willing_to_work_on
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL;
