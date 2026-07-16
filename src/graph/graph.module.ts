import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { GraphAuthService } from "./services/graph-auth.service";
import { GraphMailService } from "./services/graph-mail.service";

@Module({
  imports: [
    HttpModule.register({
      timeout: 20_000,
      maxRedirects: 0,
    }),
  ],
  providers: [
    GraphAuthService,
    GraphMailService,
  ],
  exports: [
    GraphMailService,
  ],
})
export class GraphModule {}