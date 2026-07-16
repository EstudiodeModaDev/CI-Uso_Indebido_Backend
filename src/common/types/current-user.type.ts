export interface CurrentUser {
  //ID de public.USUARIOS
  id: number;

  /**
   * ID de auth.users de Supabase.
   */
  auth_user_id: string;

  correo: string;

  /**
   * Puede ser null mientras el usuario no esté asociado
   * con una persona de negocio.
   */
  id_persona: string | null;

  roles: string[];
}