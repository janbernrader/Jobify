import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators.js';
import type { PublicUser } from '../users/users.service.js';
import { CompaniesService } from './companies.service.js';
import { CompanyDto, UpdateCompanyDto } from './company.dto.js';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  list(@CurrentUser() user: PublicUser) {
    return this.companies.list(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: PublicUser, @Param('id', ParseIntPipe) id: number) {
    return this.companies.findOne(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: PublicUser, @Body() dto: CompanyDto) {
    return this.companies.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companies.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: PublicUser, @Param('id', ParseIntPipe) id: number) {
    return this.companies.remove(user.id, id);
  }
}
