-- Script para asignar rol super_admin a un usuario específico
-- Uso: Ejecutar este query directamente en PostgreSQL

UPDATE users 
SET role = 'super_admin' 
WHERE email = 'auroragimenez438@gmail.com';

-- Verificar que el cambio se aplicó correctamente
SELECT id, name, email, role, created_at 
FROM users 
WHERE email = 'auroragimenez438@gmail.com';

