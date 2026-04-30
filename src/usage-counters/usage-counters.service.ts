import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsageCounter } from './entities/usage-counter.entity';

@Injectable()
export class UsageCountersService {
  constructor(
    @InjectRepository(UsageCounter)
    private readonly usageCounterRepository: Repository<UsageCounter>,
  ) {}

  async findByTenant(tenantId: string): Promise<UsageCounter[]> {
    return this.usageCounterRepository.find({ where: { tenantId } });
  }

  async findOne(tenantId: string, variableName: string): Promise<UsageCounter | null> {
    return this.usageCounterRepository.findOne({
      where: { tenantId, variableName },
    });
  }

  async upsert(tenantId: string, variableName: string, currentCount: number): Promise<UsageCounter> {
    let counter = await this.findOne(tenantId, variableName);
    if (!counter) {
      counter = this.usageCounterRepository.create({
        tenantId,
        variableName,
        currentCount,
      });
    } else {
      counter.currentCount = currentCount;
    }
    return this.usageCounterRepository.save(counter);
  }
}
