import { IsNotEmpty, IsString } from 'class-validator';
import { HTTP_MESSAGES } from '../http.constants';

export class CredentialsDto {
  @IsString({ message: HTTP_MESSAGES.USERNAME_REQUIRED })
  @IsNotEmpty({ message: HTTP_MESSAGES.USERNAME_REQUIRED })
  username!: string;

  @IsString({ message: HTTP_MESSAGES.PASSWORD_REQUIRED })
  @IsNotEmpty({ message: HTTP_MESSAGES.PASSWORD_REQUIRED })
  password!: string;
}
