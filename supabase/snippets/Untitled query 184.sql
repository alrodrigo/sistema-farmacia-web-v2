UPDATE user_profiles 
SET role_id = (SELECT id FROM roles WHERE name = 'admin' LIMIT 1)
WHERE full_name = 'Cajero de Turno';
