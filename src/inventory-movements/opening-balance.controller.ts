import { BadRequestException, Body, Controller, Get, Param, Post, Request, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { OpeningBalanceService } from './opening-balance.service';
import { OpeningItem, StockEntityType } from './opening-balance';

/** Saldo inicial de inventario (existencias sin documento al empezar a usar InOut). */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory-movements/opening-balance')
export class OpeningBalanceController {
  constructor(private readonly service: OpeningBalanceService) {}

  /** Plantilla de Excel con los ítems que aún no tienen movimientos. */
  @Get('template')
  @Roles('admin')
  async template(@Request() req: any, @Res() res: Response) {
    const buffer = await this.service.template(req.user?.tenantId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="saldos_iniciales.xlsx"');
    res.send(buffer);
  }

  @Get('pending')
  @Roles('admin')
  pending(@Request() req: any) {
    return this.service.pendingItems(req.user?.tenantId);
  }

  @Get('status/:type/:id')
  @Roles('admin', 'operator')
  status(@Param('type') type: StockEntityType, @Param('id') id: string, @Request() req: any) {
    return this.service.status(req.user?.tenantId, type, id);
  }

  @Post()
  @Roles('admin')
  register(@Body() body: { items: OpeningItem[] }, @Request() req: any) {
    if (!body || !Array.isArray(body.items)) throw new BadRequestException('Envía la lista de ítems (items).');
    return this.service.register(req.user?.tenantId, body.items, req.user?.email);
  }

  @Post('upload')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    return this.service.upload(req.user?.tenantId, file, req.user?.email);
  }
}
