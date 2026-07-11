import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { UsageCounter } from './entities/usage-counter.entity';

/**
 * Cron job que resetea los contadores mensuales (nLotes, nVentas)
 * automáticamente el día 1 de cada mes a las 00:00 UTC.
 */
@Injectable()
export class MonthlyResetCron {
  private readonly logger = new Logger('MonthlyResetCron');
  private readonly monthlyVariables = ['nLotes', 'nVentas'];

  constructor(
    @InjectRepository(UsageCounter)
    private readonly usageCounterRepository: Repository<UsageCounter>,
  ) {}

  @Cron('0 0 1 * *') // Minuto 0, hora 0, día 1, todos los meses
  async handleMonthlyReset(): Promise<void> {
    this.logger.log('Iniciando reset mensual de contadores (nLotes, nVentas)...');

    try {
      const result = await this.usageCounterRepository.update(
        { variableName: In(this.monthlyVariables) },
        { currentCount: 0 },
      );

      this.logger.log(
        `Reset mensual completado. ${result.affected} contadores reseteados a 0.`,
      );
    } catch (error) {
      this.logger.error('Error en reset mensual de contadores:', error.message);
    }
  }
}
