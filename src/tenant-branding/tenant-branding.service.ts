import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantBranding } from './entities/tenant-branding.entity';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES, logoVariant } from './logo-url';

export interface TenantBrandingView {
  tenantId: string;
  logoUrl: string | null;
  /** PNG acotado, para documentos PDF. */
  logoPdfUrl: string | null;
  /** Formato automático, para mostrar en web/MarketPlace. */
  logoWebUrl: string | null;
  updatedAt: Date | null;
}

@Injectable()
export class TenantBrandingService {
  private readonly logger = new Logger(TenantBrandingService.name);
  /** Logo en data URL por tenant (para pdfmake), invalidado al cambiar el logo. */
  private readonly dataUrlCache = new Map<string, { url: string; dataUrl: string }>();

  constructor(
    @InjectRepository(TenantBranding)
    private readonly repo: Repository<TenantBranding>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  private view(tenantId: string, b: TenantBranding | null): TenantBrandingView {
    const url = b?.logoUrl || null;
    return {
      tenantId,
      logoUrl: url,
      logoPdfUrl: logoVariant(url, 'pdf'),
      logoWebUrl: logoVariant(url, 'web'),
      updatedAt: b?.updatedAt || null,
    };
  }

  async get(tenantId: string): Promise<TenantBrandingView> {
    const b = await this.repo.findOne({ where: { tenantId } });
    return this.view(tenantId, b);
  }

  async uploadLogo(tenantId: string, file: Express.Multer.File | undefined): Promise<TenantBrandingView> {
    if (!file?.buffer?.length) throw new BadRequestException('Selecciona una imagen para el logo.');
    if (!LOGO_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('El logo debe ser PNG, JPG o WebP.');
    }
    if (file.size > LOGO_MAX_BYTES) throw new BadRequestException('El logo no puede pesar más de 2 MB.');

    const uploaded = await this.cloudinary.uploadImageFromBuffer(file.buffer, `inout/tenants/${tenantId}/branding`);

    let b = await this.repo.findOne({ where: { tenantId } });
    const previousPublicId = b?.logoPublicId;
    if (!b) b = this.repo.create({ tenantId });
    b.logoUrl = uploaded.secure_url;
    b.logoPublicId = uploaded.public_id;
    b = await this.repo.save(b);
    this.dataUrlCache.delete(tenantId);

    if (previousPublicId && previousPublicId !== uploaded.public_id) {
      await this.cloudinary.destroy(previousPublicId).catch((err) =>
        this.logger.warn(`No se pudo borrar el logo anterior ${previousPublicId}: ${err?.message || err}`),
      );
    }
    return this.view(tenantId, b);
  }

  async removeLogo(tenantId: string): Promise<TenantBrandingView> {
    const b = await this.repo.findOne({ where: { tenantId } });
    if (!b?.logoUrl) return this.view(tenantId, b);
    const publicId = b.logoPublicId;
    b.logoUrl = null;
    b.logoPublicId = null;
    await this.repo.save(b);
    this.dataUrlCache.delete(tenantId);
    if (publicId) {
      await this.cloudinary.destroy(publicId).catch((err) =>
        this.logger.warn(`No se pudo borrar el logo ${publicId}: ${err?.message || err}`),
      );
    }
    return this.view(tenantId, b);
  }

  /**
   * Logo como data URL PNG para incrustar en PDFs generados en el servidor.
   * Devuelve null si no hay logo o no se pudo descargar (el PDF sale sin logo).
   */
  async getLogoDataUrl(tenantId: string): Promise<string | null> {
    const { logoPdfUrl } = await this.get(tenantId);
    if (!logoPdfUrl) return null;
    const cached = this.dataUrlCache.get(tenantId);
    if (cached?.url === logoPdfUrl) return cached.dataUrl;
    try {
      const res = await fetch(logoPdfUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
      this.dataUrlCache.set(tenantId, { url: logoPdfUrl, dataUrl });
      return dataUrl;
    } catch (err: any) {
      this.logger.warn(`No se pudo descargar el logo del tenant ${tenantId}: ${err?.message || err}`);
      return null;
    }
  }
}
