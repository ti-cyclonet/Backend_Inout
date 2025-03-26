import { PartialType } from '@nestjs/mapped-types';
import { CreateMaterialTDto } from './create-material-t.dto';

export class UpdateMaterialTDto extends PartialType(CreateMaterialTDto) {}
