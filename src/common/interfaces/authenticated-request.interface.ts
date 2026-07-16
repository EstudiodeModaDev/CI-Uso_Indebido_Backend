import type { Request } from "express";
import type { CurrentUser } from "../types/current-user.type";

export interface AuthenticatedRequest extends Request {
  user?: CurrentUser;
}