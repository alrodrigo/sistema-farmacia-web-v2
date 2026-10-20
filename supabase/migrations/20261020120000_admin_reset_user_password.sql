-- ==============================================================================
-- MIGRACIÓN: FUNCIÓN RPC PARA CAMBIO DE CONTRASEÑA EXCLUSIVA DE ADMINISTRADOR
-- Permite que ÚNICAMENTE un Administrador activo pueda resetear o cambiar
-- la contraseña de cualquier colaborador o de sí mismo con máxima seguridad.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    p_target_user_id UUID,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_caller_role VARCHAR;
    v_target_user RECORD;
BEGIN
    -- 1. Validar longitud mínima de la nueva contraseña
    IF LENGTH(TRIM(p_new_password)) < 6 THEN
        RAISE EXCEPTION 'La contraseña debe contener al menos 6 caracteres';
    END IF;

    -- 2. Validar que el usuario que ejecuta la función sea un Administrador activo
    SELECT r.name INTO v_caller_role
    FROM public.user_profiles up
    JOIN public.roles r ON up.role_id = r.id
    WHERE up.id = auth.uid() AND up.is_active = true;

    IF v_caller_role IS NULL OR LOWER(v_caller_role) <> 'admin' THEN
        RAISE EXCEPTION 'Operación denegada: Solo un Administrador activo tiene autorización para cambiar contraseñas';
    END IF;

    -- 3. Verificar que el usuario objetivo exista en auth.users
    SELECT * INTO v_target_user FROM auth.users WHERE id = p_target_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El usuario objetivo no existe en el sistema de autenticación';
    END IF;

    -- 4. Actualizar la contraseña encriptada usando bcrypt (pgcrypto)
    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = NOW()
    WHERE id = p_target_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Contraseña actualizada exitosamente por el administrador'
    );
END;
$$;

-- Restricción estricta de permisos: Solo usuarios autenticados pueden invocarla,
-- y dentro de la función se valida que sea estrictamente rol 'admin'.
REVOKE EXECUTE ON FUNCTION public.admin_reset_user_password FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password TO authenticated;

COMMENT ON FUNCTION public.admin_reset_user_password IS 'Permite a administradores activos resetear contraseñas de personal de forma segura y centralizada';
