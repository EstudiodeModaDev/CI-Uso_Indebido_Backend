import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "./database.constants";

export const supabaseClientProvider: Provider = {
  provide: SUPABASE_CLIENT,

  inject: [ConfigService],

  useFactory: (configService: ConfigService): SupabaseClient => {
    const supabaseUrl = configService.getOrThrow<string>("supabase.url");
    const supabaseSecretKey = configService.getOrThrow<string>("supabase.secretKey");

    return createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  },
};