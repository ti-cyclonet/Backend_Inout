import { Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DiningService, OnlineReservationInput } from './dining.service';

/**
 * Reservas desde la tienda online (sin sesión). El cliente maneja su reserva
 * con el enlace privado que recibe (token).
 */
@Controller('dining/public')
export class DiningPublicController {
  constructor(private readonly dining: DiningService) {}

  @Get('reservation/:token')
  view(@Param('token') token: string) {
    return this.dining.viewByToken(token);
  }

  @Post('reservation/:token/cancel')
  cancel(@Param('token') token: string) {
    return this.dining.cancelByToken(token);
  }

  @Post('reservation/:token/deposit')
  @UseInterceptors(FileInterceptor('proof', { limits: { fileSize: 6 * 1024 * 1024 } }))
  deposit(@Param('token') token: string, @UploadedFile() file: Express.Multer.File, @Body() body: { reference?: string }) {
    return this.dining.depositProofByToken(token, file, body?.reference);
  }

  @Get(':tenantId')
  info(@Param('tenantId') tenantId: string) {
    return this.dining.publicInfo(tenantId);
  }

  @Get(':tenantId/availability')
  availability(@Param('tenantId') tenantId: string, @Query('date') date: string, @Query('party') party: string) {
    return this.dining.publicAvailability(tenantId, date, Number(party));
  }

  @Post(':tenantId/reservations')
  book(@Param('tenantId') tenantId: string, @Body() body: OnlineReservationInput, @Req() req: any) {
    return this.dining.bookOnline(tenantId, body || {}, {
      ipAddress: String(req?.headers?.['x-forwarded-for'] || req?.ip || '').split(',')[0].trim(),
      userAgent: String(req?.headers?.['user-agent'] || ''),
    });
  }
}
