import { Global, Module } from "@nestjs/common";
import { supabaseClientProvider } from "./supabase-client.provider";

@Global()
@Module({
  providers: [supabaseClientProvider],
  exports: [supabaseClientProvider],
})
export class DatabaseModule {}