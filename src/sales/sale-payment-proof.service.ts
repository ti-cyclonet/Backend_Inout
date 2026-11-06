import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Volante del datáfono o comprobante de la transferencia de una venta de
 * contado que no fue en efectivo (opcional): foto y N° de aprobación o
 * referencia. Se puede adjuntar al registrar la venta o después.
 */
@Injectable()
export class SalePaymentProofService {
  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async attach(tenantId: string, saleId: string, file: Express.Multer.File | undefined, reference: unknown): Promise<Sale> {
    const ref = String(reference ?? '').trim().slice(0, 100);
    if (!file && !ref) throw new BadRequestException('Adjunta la foto del volante o escribe la referencia.');
    if (file && (!PROOF_TYPES.includes(file.mimetype) || file.size > PROOF_MAX_BYTES)) {
      throw new BadRequestException('El volante debe ser una imagen JPG, PNG o WEBP de máximo 5 MB.');
    }
    const sale = await this.sales.findOne({ where: { strId: saleId, strTenantId: tenantId } });
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    const methods = Array.isArray(sale.payments) && sale.payments.length ? sale.payments.map((p) => String(p.method).toUpperCase()) : [String(sale.paymentMethod || 'EFECTIVO').toUpperCase()];
    if (String(sale.paymentType || '').toUpperCase() === 'CREDITO' || methods.every((m) => m === 'EFECTIVO')) {
      throw new BadRequestException('El volante aplica a ventas de contado con tarjeta, transferencia u otro medio que no sea efectivo.');
    }
    if (file) {
      const uploaded = await this.cloudinary.uploadImageFromBuffer(file.buffer, 'inout/sale-payment-proofs', tenantId);
      sale.strPaymentProofUrl = uploaded.secure_url;
    }
    if (ref) sale.strPaymentReference = ref;
    return this.sales.save(sale);
  }
}
