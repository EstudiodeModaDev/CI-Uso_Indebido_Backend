import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GraphModule } from "../graph/graph.module";
import { EMAIL_PROVIDER } from "./emails.constants";
import { EmailsController } from "./emails.controller";
import { EmailsService } from "./emails.service";
import type { EmailProvider } from "./interfaces/email-provider.interface";
import { ConsoleEmailProvider } from "./providers/console-email.provider";
import { GraphEmailProvider } from "./providers/graph-email.provider";
import { EmailLogsRepository } from "./repositories/email-logs.repository";

@Module({
  imports: [
    GraphModule,
  ],
  controllers: [
    EmailsController,
  ],
  providers: [
    EmailsService,
    EmailLogsRepository,
    ConsoleEmailProvider,
    GraphEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      inject: [
        ConfigService,
        ConsoleEmailProvider,
        GraphEmailProvider,
      ],
      useFactory: (
        configService: ConfigService,
        consoleProvider: ConsoleEmailProvider,
        graphProvider: GraphEmailProvider,
      ): EmailProvider => {
        const provider =
          configService.get<string>(
            "email.provider",
          );

        if (provider === "graph") {
          return graphProvider;
        }

        return consoleProvider;
      },
    },
  ],
  exports: [
    EmailsService,
  ],
})
export class EmailsModule {}