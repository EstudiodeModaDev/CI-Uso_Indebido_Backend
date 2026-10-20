import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '../common/types/current-user.type';
import { OtpService } from './otp.service';
import { GenerateOtpDto } from './dto/generate-otp-dto';
import { Roles } from 'src/common/decorators/roles.decorartor';
import { ValidateOtpDto } from './dto/validate-otp.dto';
import { RedeemOtpDto } from './dto/redeem-otp.dto';
import { OtpHistoryDto } from './dto/otp-history.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { PublicOtpHistoryDto } from './dto/public-otp-history.dto';
import { AdminOtpHistoryDto } from './dto/admin-otp-history.dto';
import { ForgotPasswordOtpDto } from './dto/forgot-password-otp.dto';
import { ValidatePasswordOtpDto } from './dto/validate-password-otp.dto';

@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('generate')
  generate(@Body() dto: GenerateOtpDto, @CurrentUser() user: CurrentUserType) {
    return this.otpService.generateBuyCode(dto.document, user);
  }

  @Public()
  @Post('generate-password')
  generatePassword(@Body() dto: ForgotPasswordOtpDto) {
    return this.otpService.generateChangePasswordCode(dto.email);
  }

  @Public()
  @Post('validate-password')
  validatePassword(@Body() dto: ValidatePasswordOtpDto) {
    return this.otpService.validatePasswordCode(dto.email, dto.code);
  }

  @Roles('TIENDA')
  @Post('validate')
  validate(@Body() dto: ValidateOtpDto, @CurrentUser() user: CurrentUserType) {
    return this.otpService.validate(dto.document, dto.code, user);
  }

  @Roles('TIENDA')
  @Post('redeem')
  redeem(@Body() dto: RedeemOtpDto, @CurrentUser() user: CurrentUserType) {
    return this.otpService.redeem(
      dto.document,
      dto.code,
      dto.purchaseValue,
      user,
      dto.invoiceNumber,
    );
  }

  @Public()
  @Post('history')
  history(@Body() dto: PublicOtpHistoryDto) {
    return this.otpService.historyPublic(dto.document, dto.email);
  }

  @Roles('TIENDA')
  @Post('history/internal')
  historyInternal(
    @Body() dto: OtpHistoryDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.otpService.history(dto.document, user);
  }

  @Roles('CONTROL_INTERNO')
  @Post('history/admin')
  historyAdmin(
    @Body() dto: AdminOtpHistoryDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.otpService.listAllForAdmin(
      {
        document: dto.document,
        generationStoreId: dto.generationStoreId,
        redemptionStoreId: dto.redemptionStoreId,
        page: dto.page ?? 1,
        pageSize: dto.pageSize ?? 25,
      },
      user,
    );
  }
}
