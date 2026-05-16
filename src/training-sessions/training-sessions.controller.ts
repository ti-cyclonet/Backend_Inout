import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { TrainingSessionsService } from './training-sessions.service';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { CheckLimit } from '../usage-counters/decorators/check-limit.decorator';
import { LimitEnforcementGuard } from '../usage-counters/guards/limit-enforcement.guard';

@Controller('training-sessions')
@UseGuards(JwtAuthGuard)
export class TrainingSessionsController {
  constructor(private readonly trainingSessionsService: TrainingSessionsService) {}

  @Post()
  @UseGuards(LimitEnforcementGuard)
  @CheckLimit('nSesionesCap')
  create(@Body() dto: CreateTrainingSessionDto, @GetTenantId() tenantId: string) {
    return this.trainingSessionsService.create(dto, tenantId);
  }

  @Get()
  findAll(
    @GetTenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.trainingSessionsService.findAll(tenantId, +(page || 1), +(limit || 10));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.trainingSessionsService.findOne(id, tenantId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTrainingSessionDto, @GetTenantId() tenantId: string) {
    return this.trainingSessionsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.trainingSessionsService.remove(id, tenantId);
  }
}
