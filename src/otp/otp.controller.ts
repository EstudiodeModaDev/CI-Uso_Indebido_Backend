import {
  Body,
  Controller,
  Post,
} from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUser as CurrentUserType } from "../common/types/current-user.type";
import { OtpService } from "./otp.service";
import { GenerateOtpDto } from "./dto/generate-otp-dto";
import { Roles } from "src/common/decorators/roles.decorartor";
import { ValidateOtpDto } from "./dto/validate-otp.dto";
import { RedeemOtpDto } from "./dto/redeem-otp.dto";
import { OtpHistoryDto } from "./dto/otp-history.dto";

@Controller("otp")
export class OtpController {
  constructor(
    private readonly otpService: OtpService,
  ) {}

  @Post("generate")
  generate(
    @Body() dto: GenerateOtpDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.otpService.generate(
      dto.document,
      user,
    );
  }

  @Roles("TIENDA")
  @Post("validate")
  validate(
    @Body() dto: ValidateOtpDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.otpService.validate(
      dto.document,
      dto.code,
      user,
    );
  }

  @Roles("TIENDA")
  @Post("redeem")
  redeem(
    @Body() dto: RedeemOtpDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.otpService.redeem(
      dto.document,
      dto.code,
      dto.purchaseValue,
      user,
    );
  }

  @Roles("TIENDA")
  @Post("history")
  history(
    @Body() dto: OtpHistoryDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.otpService.history(
      dto.document,
      user,
    );
  }
}
