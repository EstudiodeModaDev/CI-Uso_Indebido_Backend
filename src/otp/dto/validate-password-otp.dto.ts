import { IsEmail, IsString, Matches } from 'class-validator';

export class ValidatePasswordOtpDto {
  @IsEmail(
    {},
    {
      message: 'Debe enviar un correo electrónico válido.',
    },
  )
  email!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, {
    message: 'El código debe tener 6 dígitos.',
  })
  code!: string;
}
