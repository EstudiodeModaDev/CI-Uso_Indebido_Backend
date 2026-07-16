import { Inject, Injectable } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../database/database.constants";

export interface HealthResult {
  status: "ok" | "degraded";
  database: "ok" | "error";
  cause: string
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async check(): Promise<HealthResult> {
    const { error } = await this.supabase
      .from("LOG")
      .select("id")
      .limit(1);

    return {
      status: error ? "degraded" : "ok",
      database: error ? "error" : "ok",
      timestamp: new Date().toISOString(),
      cause: error ? error.message : ""
    };
  }
}