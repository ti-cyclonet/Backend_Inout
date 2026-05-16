import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrainingSession } from './entities/training-session.entity';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';
import { LimitEnforcementService } from '../usage-counters/limit-enforcement.service';

@Injectable()
export class TrainingSessionsService {
  constructor(
    @InjectRepository(TrainingSession)
    private readonly trainingSessionRepository: Repository<TrainingSession>,
    private readonly limitEnforcementService: LimitEnforcementService,
  ) {}

  async create(dto: CreateTrainingSessionDto, tenantId: string): Promise<TrainingSession> {
    const code = await this.generateSessionCode(tenantId);

    const session = this.trainingSessionRepository.create({
      ...dto,
      strTenantId: tenantId,
      strCode: code,
      strStatus: dto.strStatus || 'SCHEDULED',
      intDurationMinutes: dto.intDurationMinutes || 60,
      intAttendees: dto.intAttendees || 0,
    });

    return this.trainingSessionRepository.save(session);
  }

  async findAll(tenantId: string, page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    const [sessions, total] = await this.trainingSessionRepository.findAndCount({
      where: { strTenantId: tenantId },
      order: { dtmDate: 'DESC', dtmCreationDate: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      data: sessions,
      total,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, tenantId: string): Promise<TrainingSession> {
    const session = await this.trainingSessionRepository.findOne({
      where: { strId: id, strTenantId: tenantId },
    });

    if (!session) {
      throw new NotFoundException(`Sesión de capacitación con id '${id}' no encontrada`);
    }

    return session;
  }

  async update(id: string, dto: UpdateTrainingSessionDto, tenantId: string): Promise<TrainingSession> {
    const session = await this.findOne(id, tenantId);
    Object.assign(session, dto);
    return this.trainingSessionRepository.save(session);
  }

  async remove(id: string, tenantId: string): Promise<{ message: string }> {
    const session = await this.findOne(id, tenantId);
    await this.trainingSessionRepository.remove(session);
    await this.limitEnforcementService.decrement(tenantId, 'nSesionesCap');
    return { message: `Sesión de capacitación eliminada exitosamente` };
  }

  private async generateSessionCode(tenantId: string): Promise<string> {
    const prefix = await this.getContractPrefix(tenantId);

    const lastSession = await this.trainingSessionRepository
      .createQueryBuilder('session')
      .where('session.strTenantId = :tenantId', { tenantId })
      .andWhere('session.strCode IS NOT NULL')
      .andWhere('session.strCode LIKE :pattern', { pattern: `${prefix}-SC-%` })
      .orderBy('session.strCode', 'DESC')
      .getOne();

    let nextNumber = 1;
    if (lastSession && lastSession.strCode) {
      const parts = lastSession.strCode.split('-');
      const lastNumber = parseInt(parts[parts.length - 1]);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}-SC-${nextNumber.toString().padStart(5, '0')}`;
  }

  private async getContractPrefix(tenantId: string): Promise<string> {
    try {
      const authorizaUrl = process.env.AUTHORIZA_URL || 'http://localhost:3000/api';
      const response = await fetch(`${authorizaUrl}/contracts/tenant/${tenantId}`);

      if (response.ok) {
        const contract = await response.json();
        return contract.codePrefix || 'ABC';
      }
    } catch (error) {
      console.error('Error obteniendo prefijo del contrato:', error);
    }

    return 'ABC';
  }
}
