import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Activity } from '../materials/entities/activity.entity';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldActivities() {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    try {
      const result = await this.activityRepository.delete({
        dtmCreationDate: LessThan(fiveDaysAgo),
      });

      this.logger.log(`Cleaned up ${result.affected} old activities`);
    } catch (error) {
      this.logger.error('Error cleaning up old activities:', error);
    }
  }
}