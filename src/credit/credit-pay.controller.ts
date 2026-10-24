import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreditVouchersService, VoucherInput } from './credit-vouchers.service';

/**
 * Enlace público de pago de cartera (sin cuenta): llega en el recordatorio de
 * pago. El token de la cuenta por cobrar es la credencial, como el enlace de
 * seguimiento de un pedido.
 */
@Controller('credit-pay')
export class CreditPayController {
  constructor(private readonly vouchers: CreditVouchersService) {}

  @Get(':token')
  view(@Param('token') token: string) {
    return this.vouchers.publicView(token);
  }

  /** El cliente sube el comprobante (imagen, máx. 5 MB): queda por verificar. */
  @Post(':token/vouchers')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  submit(@Param('token') token: string, @Body() body: VoucherInput, @UploadedFile() file: Express.Multer.File) {
    return this.vouchers.submit(token, body, file);
  }
}
