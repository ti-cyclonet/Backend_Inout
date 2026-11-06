import { ArrayMaxSize, IsArray, IsString } from 'class-validator';
import { MAX_CODES_PER_ITEM } from '../barcode-codes';

export class SetBarcodesDto {
  @IsArray()
  @ArrayMaxSize(MAX_CODES_PER_ITEM)
  @IsString({ each: true })
  codes: string[];
}
