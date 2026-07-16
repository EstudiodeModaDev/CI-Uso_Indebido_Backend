import { IsNumber, Min } from "class-validator";
import { ValidateOtpDto } from "./validate-otp.dto";

export class RedeemOtpDto extends ValidateOtpDto {
  @IsNumber()
  @Min(0.01)
  purchaseValue!: number;
}