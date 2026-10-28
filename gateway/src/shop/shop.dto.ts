import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { HTTP_MESSAGES } from '../http.constants';

export class BuyItemDto {
  @ApiProperty({ example: 'gota-e6194b' })
  @IsString({ message: HTTP_MESSAGES.ITEM_REQUIRED })
  @IsNotEmpty({ message: HTTP_MESSAGES.ITEM_REQUIRED })
  itemId!: string;
}
