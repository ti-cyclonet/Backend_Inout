import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeedbackInput, FeedbackService, FeedbackUser } from './feedback.service';

/** «Danos tu opinión»: usuarios del negocio (no los clientes del Market). */
@Controller('feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  private userOf(req: Request): FeedbackUser {
    const u = req.user as any;
    if (!u?.tenantId || u?.role === 'clienteInout') throw new ForbiddenException('Solo usuarios del negocio.');
    return { id: u.id, email: u.email, tenantId: u.tenantId };
  }

  @Post()
  submit(@Req() req: Request, @Body() body: FeedbackInput) {
    return this.service.submit(this.userOf(req), body);
  }

  /** ¿Mostrar la invitación a opinar? */
  @Get('invitation')
  invitation(@Req() req: Request) {
    return this.service.invitation(this.userOf(req));
  }
}
