import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { DiningService, ReservationInput } from './dining.service';
import { ReservationStatus } from './dining-rules';

/**
 * Mesas y reservas (panel). Lo ve todo el equipo; reservas y llegadas las
 * maneja el admin o el operador; el plano y las reglas, el admin.
 */
@Controller('dining')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DiningController {
  constructor(private readonly dining: DiningService) {}

  @Get('settings')
  @Roles('admin', 'operator', 'viewer')
  async getSettings(@GetTenantId() tenantId: string) {
    await this.dining.assertEnabled(tenantId);
    return this.dining.getSettings(tenantId);
  }

  @Patch('settings')
  @Roles('admin')
  async updateSettings(@GetTenantId() tenantId: string, @Body() body: any) {
    await this.dining.assertEnabled(tenantId);
    return this.dining.updateSettings(tenantId, body);
  }

  @Get('tables')
  @Roles('admin', 'operator', 'viewer')
  async listTables(@GetTenantId() tenantId: string) {
    await this.dining.assertEnabled(tenantId);
    return this.dining.listTables(tenantId);
  }

  @Post('tables')
  @Roles('admin')
  async createTable(@GetTenantId() tenantId: string, @Body() body: any) {
    await this.dining.assertEnabled(tenantId);
    return this.dining.createTable(tenantId, body);
  }

  @Put('tables/layout')
  @Roles('admin')
  async saveLayout(@GetTenantId() tenantId: string, @Body() body: any) {
    await this.dining.assertEnabled(tenantId);
    return this.dining.saveLayout(tenantId, body);
  }

  @Patch('tables/:id')
  @Roles('admin')
  async updateTable(@GetTenantId() tenantId: string, @Param('id') id: string, @Body() body: any) {
    await this.dining.assertEnabled(tenantId);
    return this.dining.updateTable(tenantId, id, body);
  }

  @Delete('tables/:id')
  @Roles('admin')
  async removeTable(@GetTenantId() tenantId: string, @Param('id') id: string) {
    await this.dining.assertEnabled(tenantId);
    return this.dining.removeTable(tenantId, id);
  }

  @Get('reservations')
  @Roles('admin', 'operator', 'viewer')
  async listReservations(@GetTenantId() tenantId: string, @Query('date') date: string) {
    await this.dining.assertEnabled(tenantId);
    return this.dining.listReservations(tenantId, date);
  }

  @Get('availability')
  @Roles('admin', 'operator', 'viewer')
  async availability(@GetTenantId() tenantId: string, @Query('date') date: string, @Query('party') party: string) {
    await this.dining.assertEnabled(tenantId);
    return this.dining.availability(tenantId, date, Number(party));
  }

  @Post('reservations')
  @Roles('admin', 'operator')
  async createReservation(@GetTenantId() tenantId: string, @Body() body: ReservationInput) {
    await this.dining.assertEnabled(tenantId);
    return this.dining.createReservation(tenantId, body || {});
  }

  @Patch('reservations/:id')
  @Roles('admin', 'operator')
  async updateReservation(@GetTenantId() tenantId: string, @Param('id') id: string, @Body() body: ReservationInput) {
    await this.dining.assertEnabled(tenantId);
    return this.dining.updateReservation(tenantId, id, body || {});
  }

  /** Anticipo de una reserva de la tienda: verificarlo (confirma la reserva) o rechazarlo. */
  @Patch('reservations/:id/deposit')
  @Roles('admin', 'operator')
  async reviewDeposit(@GetTenantId() tenantId: string, @Param('id') id: string, @Body() body: { approve?: boolean }) {
    await this.dining.assertEnabled(tenantId);
    return this.dining.reviewDeposit(tenantId, id, body?.approve === true);
  }

  @Patch('reservations/:id/status')
  @Roles('admin', 'operator')
  async setStatus(@GetTenantId() tenantId: string, @Param('id') id: string, @Body() body: { status: ReservationStatus; reason?: string }) {
    await this.dining.assertEnabled(tenantId);
    return this.dining.setStatus(tenantId, id, body?.status, body?.reason);
  }
}
