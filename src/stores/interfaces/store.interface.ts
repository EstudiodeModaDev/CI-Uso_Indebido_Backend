export interface Store {
  id: string;
  name: string;
  code: string | null;
  email: string;
  status: "ACTIVA" | "INACTIVA";
}