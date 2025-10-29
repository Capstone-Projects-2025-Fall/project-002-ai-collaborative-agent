-- Direct fix for the specific user profile issue
-- This creates a profile for the specific user ID that's failing

-- First, let's create a profile for the specific user that's causing the error
INSERT INTO public.profiles (id, name, skills, programming_languages, willing_to_work_on)
VALUES (
    'a9fa1483-6eef-4f39-ab01-48996420d544',
    'User',
    '',
    '',
    ''
)
ON CONFLICT (id) DO NOTHING;

-- Also create a profile for the other user ID we saw earlier
INSERT INTO public.profiles (id, name, skills, programming_languages, willing_to_work_on)
VALUES (
    'f575b6cb-f437-48b7-a1fd-5f2186c6547c',
    'Thomas Ishida',
    '',
    '',
    ''
)
ON CONFLICT (id) DO NOTHING;

-- Now let's also create profiles for any other users in auth.users who don't have profiles
INSERT INTO public.profiles (id, name, skills, programming_languages, willing_to_work_on)
SELECT 
    au.id,
    COALESCE(
        au.raw_user_meta_data->>'full_name', 
        au.raw_user_meta_data->>'name', 
        'User'
    ) as name,
    '' as skills,
    '' as programming_languages,
    '' as willing_to_work_on
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL;
