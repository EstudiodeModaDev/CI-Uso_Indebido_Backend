import { IsEmail } from 'class-validator';

export class ForgotPasswordOtpDto {
  @IsEmail(
    {},
    {
      message: 'Debe enviar un correo electrónico válido.',
    },
  )
  email!: string;
}
