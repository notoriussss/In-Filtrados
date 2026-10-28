import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { HTTP_MESSAGES } from '../http.constants';

export class CredentialsDto {
  @ApiProperty()
  @IsString({ message: HTTP_MESSAGES.USERNAME_REQUIRED })
  @IsNotEmpty({ message: HTTP_MESSAGES.USERNAME_REQUIRED })
  username!: string;

  @ApiProperty()
  @IsString({ message: HTTP_MESSAGES.PASSWORD_REQUIRED })
  @IsNotEmpty({ message: HTTP_MESSAGES.PASSWORD_REQUIRED })
  password!: string;
}
