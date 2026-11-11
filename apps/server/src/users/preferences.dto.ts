import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import {
  DASHBOARD_CARDS,
  JOB_COLUMNS,
  type DashboardCard,
  type DashboardLayout,
  type JobColumn,
} from './preferences.js';

export class DashboardLayoutDto implements DashboardLayout {
  @IsArray()
  @IsIn(DASHBOARD_CARDS, { each: true })
  order!: DashboardCard[];

  @IsArray()
  @IsIn(DASHBOARD_CARDS, { each: true })
  hidden!: DashboardCard[];
}

export class PreferencesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => DashboardLayoutDto)
  dashboard?: DashboardLayoutDto;

  @IsOptional()
  @IsArray()
  @IsIn(JOB_COLUMNS, { each: true })
  hiddenJobColumns?: JobColumn[];

  /** A currency code such as EUR, or empty to go back to no default. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{0,3}$/, { message: 'defaultCurrency must be a currency code, such as EUR' })
  defaultCurrency?: string;
}
