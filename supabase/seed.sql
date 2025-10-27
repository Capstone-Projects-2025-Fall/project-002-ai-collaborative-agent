-- Seed data for development and testing
-- This file contains sample data to help with development and testing

-- Note: In a real application, you would not seed with actual user data
-- This is for development/testing purposes only

-- Sample profiles (these would normally be created by the handle_new_user trigger)
-- INSERT INTO public.profiles (user_id, name, skills, languages, preferences) VALUES
-- ('00000000-0000-0000-0000-000000000001', 'John Doe', ARRAY['JavaScript', 'TypeScript', 'React'], ARRAY['English', 'Spanish'], 'Prefers morning meetings'),
-- ('00000000-0000-0000-0000-000000000002', 'Jane Smith', ARRAY['Python', 'Django', 'PostgreSQL'], ARRAY['English', 'French'], 'Likes pair programming'),
-- ('00000000-0000-0000-0000-000000000003', 'Mike Johnson', ARRAY['Java', 'Spring Boot', 'AWS'], ARRAY['English', 'German'], 'Prefers async communication');

-- Sample projects (these would be created by users through the application)
-- INSERT INTO public.projects (name, description, owner_id, invite_code) VALUES
-- ('Web Development Project', 'Building a modern web application', '00000000-0000-0000-0000-000000000001', 'ABC123'),
-- ('Data Science Initiative', 'Machine learning project for data analysis', '00000000-0000-0000-0000-000000000002', 'XYZ789'),
-- ('Mobile App Development', 'Cross-platform mobile application', '00000000-0000-0000-0000-000000000003', 'DEF456');

-- Sample project members (these would be created when users join projects)
-- INSERT INTO public.project_members (project_id, user_id, role) VALUES
-- ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner'),
-- ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'member'),
-- ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'owner'),
-- ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'owner');

-- Note: The actual seed data will be created by users through the application
-- This file serves as a template for what the data structure looks like
