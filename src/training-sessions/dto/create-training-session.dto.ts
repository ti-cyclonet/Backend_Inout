import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsDateString } from 'class-validator';

export class CreateTrainingSessionDto {
  @IsString()
  @IsNotEmpty()
  strTitle: string;

  @IsString()
  @IsOptional()
  strDescription?: string;

  @IsString()
  @IsOptional()
  strInstructor?: string;

  @IsDateString()
  @IsNotEmpty()
  dtmDate: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  intDurationMinutes?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  intAttendees?: number;

  @IsString()
  @IsOptional()
  strStatus?: string;

  @IsString()
  @IsOptional()
  strNotes?: string;
}
