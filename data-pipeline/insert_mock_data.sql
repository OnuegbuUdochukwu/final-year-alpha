-- 1. Insert Core Skills First
INSERT INTO skills (canonical_name, category, demand_weight) VALUES
('Python', 'Programming', 0.8500),
('React', 'Frontend', 0.8200),
('SQL', 'Database', 0.7800),
('Docker', 'DevOps', 0.7500),
('AWS', 'Cloud', 0.8000),
('Machine Learning', 'AI/Data', 0.8800),
('Agile', 'Soft Skill', 0.5000);

-- Retrieve the IDs for linking (Assuming IDs 1-7 based on insertion order)

-- 2. Insert Mock Learning Resources
-- 'course', 'certification', 'project', 'book'
-- 'beginner', 'intermediate', 'advanced'

INSERT INTO learning_resources (title, provider, resource_type, cost_usd, duration_hours, url, primary_skill_id, difficulty_level) VALUES
('Python for Everybody Specialization', 'Coursera', 'course', 49.00, 80, 'https://www.coursera.org/specializations/python', 1, 'beginner'),
('100 Days of Code: The Complete Python Pro Bootcamp', 'Udemy', 'course', 19.99, 60, 'https://www.udemy.com/course/100-days-of-code/', 1, 'intermediate'),
('React - The Complete Guide (incl Hooks, React Router, Redux)', 'Udemy', 'course', 24.99, 50, 'https://www.udemy.com/course/react-the-complete-guide-incl-redux/', 2, 'intermediate'),
('Meta Front-End Developer Professional Certificate', 'Coursera', 'certification', 49.00, 140, 'https://www.coursera.org/professional-certificates/meta-front-end-developer', 2, 'beginner'),
('PostgreSQL for Everybody', 'Coursera', 'course', 39.00, 40, 'https://www.coursera.org/specializations/postgresql-for-everybody', 3, 'intermediate'),
('Docker Mastery: with Kubernetes +Swarm from a Docker Captain', 'Udemy', 'course', 15.99, 20, 'https://www.udemy.com/course/docker-mastery/', 4, 'intermediate'),
('AWS Certified Solutions Architect - Associate', 'A Cloud Guru', 'certification', 35.00, 45, 'https://acloudguru.com/course/aws-certified-solutions-architect-associate-saa-c03', 5, 'intermediate'),
('Machine Learning Specialization', 'Coursera', 'course', 49.00, 100, 'https://www.coursera.org/specializations/machine-learning-introduction', 6, 'advanced'),
('Grokking Algorithms', 'Manning Publications', 'book', 31.99, 30, 'https://www.manning.com/books/grokking-algorithms', 1, 'beginner'),
('Agile Project Management', 'Coursera', 'course', 39.00, 20, 'https://www.coursera.org/learn/agile-project-management', 7, 'beginner');
