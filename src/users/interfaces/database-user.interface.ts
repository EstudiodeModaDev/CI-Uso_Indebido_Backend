export interface DatabaseUser {
  id: number;
  authUserId: string;
  email: string;
  personId: string | null;
  status: "ACTIVO" | "INACTIVO";
  roles: string[];
}