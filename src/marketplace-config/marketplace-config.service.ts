import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketplaceConfig } from './entities/marketplace-config.entity';
import { UpdateMarketplaceConfigDto } from './dto/update-marketplace-config.dto';
import { StoreInfo, storeInfoFrom } from './store-info';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { MENU_EXTRA_IMAGE_MAX_BYTES, MENU_EXTRA_IMAGE_TYPES, MenuExtras, removedImagePublicIds, resolveMenuExtras } from './menu-extras';

@Injectable()
export class MarketplaceConfigService {
  constructor(
    @InjectRepository(MarketplaceConfig)
    private readonly marketplaceConfigRepository: Repository<MarketplaceConfig>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async updateConfig(dto: UpdateMarketplaceConfigDto): Promise<MarketplaceConfig> {
    let config = await this.marketplaceConfigRepository.findOne({
      where: { tenantId: dto.tenantId },
    });

    if (config) {
      config.selectedProductIds = dto.selectedProductIds;
      // Update displayMode if provided
      if (dto.displayMode) {
        config.displayMode = dto.displayMode;
      }
      // Update slug if provided
      if ((dto as any).slug) {
        await this.validateSlug((dto as any).slug, config.id);
        config.slug = this.normalizeSlug((dto as any).slug);
      }
    } else {
      const slug = (dto as any).slug || await this.generateSlug(dto.tenantId);
      config = this.marketplaceConfigRepository.create({
        tenantId: dto.tenantId,
        selectedProductIds: dto.selectedProductIds,
        displayMode: dto.displayMode || 'grid',
        slug,
      });
    }

    return await this.marketplaceConfigRepository.save(config);
  }

  /** Guarda las formas de pago (ya normalizadas con resolvePaymentOptions). */
  async updatePaymentOptions(tenantId: string, paymentOptions: Record<string, any>) {
    const config = await this.marketplaceConfigRepository.findOne({ where: { tenantId } });
    if (!config) {
      throw new NotFoundException('Primero configura tu MarketPlace (productos visibles) y luego sus formas de pago.');
    }
    config.paymentOptions = paymentOptions;
    await this.marketplaceConfigRepository.save(config);
    return paymentOptions;
  }

  /** Guarda la programación de pedidos (ya normalizada con resolveScheduling). */
  async updateScheduling(tenantId: string, scheduling: Record<string, any>) {
    const config = await this.marketplaceConfigRepository.findOne({ where: { tenantId } });
    if (!config) {
      throw new NotFoundException('Primero configura tu MarketPlace (productos visibles) y luego sus pedidos programados.');
    }
    config.scheduling = scheduling;
    await this.marketplaceConfigRepository.save(config);
    return scheduling;
  }

  /** Guarda los textos de agradecimiento (ya normalizados con resolveThanksMessages). */
  async updateThanksMessages(tenantId: string, thanksMessages: Record<string, any>) {
    const config = await this.marketplaceConfigRepository.findOne({ where: { tenantId } });
    if (!config) {
      throw new NotFoundException('Primero configura tu MarketPlace (productos visibles) y luego el mensaje de agradecimiento.');
    }
    config.thanksMessages = thanksMessages;
    await this.marketplaceConfigRepository.save(config);
    return thanksMessages;
  }

  /** WhatsApp y mensaje de bienvenida (ya validados). Vacío se guarda como null. */
  async updateStoreInfo(tenantId: string, info: StoreInfo): Promise<StoreInfo> {
    const config = await this.marketplaceConfigRepository.findOne({ where: { tenantId } });
    if (!config) {
      throw new NotFoundException('Primero configura tu MarketPlace (productos visibles) y luego los datos de la tienda.');
    }
    config.whatsapp = info.whatsapp || null;
    config.welcomeMessage = info.welcomeMessage || null;
    await this.marketplaceConfigRepository.save(config);
    return storeInfoFrom(config);
  }

  /** Información de la carta (ya normalizada). Borra de Cloudinary las fotos que se quitaron. */
  async updateMenuExtras(tenantId: string, extras: MenuExtras): Promise<MenuExtras> {
    const config = await this.marketplaceConfigRepository.findOne({ where: { tenantId } });
    if (!config) {
      throw new NotFoundException('Primero configura tu MarketPlace (productos visibles) y luego la información de la carta.');
    }
    const before = resolveMenuExtras(config.menuExtras);
    config.menuExtras = extras;
    await this.marketplaceConfigRepository.save(config);
    for (const id of removedImagePublicIds(before, extras)) {
      await this.cloudinary.destroy(id).catch(() => undefined);
    }
    return extras;
  }

  /**
   * Sube la foto de un renglón de la carta. Se guarda en la carta al guardar la
   * información (PATCH menu-extras); una foto subida y no guardada queda huérfana.
   */
  async uploadMenuExtraImage(tenantId: string, file: Express.Multer.File): Promise<{ imageUrl: string; imagePublicId: string }> {
    if (!file) throw new BadRequestException('Selecciona una imagen.');
    if (!MENU_EXTRA_IMAGE_TYPES.includes(file.mimetype)) throw new BadRequestException('La imagen debe ser PNG, JPG o WebP.');
    if (file.size > MENU_EXTRA_IMAGE_MAX_BYTES) throw new BadRequestException('La imagen no puede pesar más de 3 MB.');
    const uploaded = await this.cloudinary.uploadImageFromBuffer(file.buffer, `inout/tenants/${tenantId}/menu`);
    return { imageUrl: uploaded.secure_url, imagePublicId: uploaded.public_id };
  }

  async getConfig(tenantId: string): Promise<MarketplaceConfig | null> {
    return await this.marketplaceConfigRepository.findOne({
      where: { tenantId },
    });
  }

  async getConfigBySlug(slug: string): Promise<MarketplaceConfig | null> {
    return await this.marketplaceConfigRepository.findOne({
      where: { slug: this.normalizeSlug(slug) },
    });
  }

  async resolveSlugToTenantId(slug: string): Promise<string | null> {
    const config = await this.getConfigBySlug(slug);
    return config?.tenantId || null;
  }

  async getAllConfigs(): Promise<MarketplaceConfig[]> {
    return await this.marketplaceConfigRepository.find();
  }

  async updateSlug(tenantId: string, newSlug: string): Promise<MarketplaceConfig> {
    const normalized = this.normalizeSlug(newSlug);
    let config = await this.marketplaceConfigRepository.findOne({ where: { tenantId } });
    
    if (!config) {
      // Create config if it doesn't exist
      config = this.marketplaceConfigRepository.create({
        tenantId,
        selectedProductIds: [],
        slug: normalized,
      });
    }

    await this.validateSlug(normalized, config.id);
    config.slug = normalized;
    return await this.marketplaceConfigRepository.save(config);
  }

  private async validateSlug(slug: string, excludeId?: string): Promise<void> {
    const existing = await this.marketplaceConfigRepository.findOne({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Este nombre de tienda ya está en uso. Elige otro.');
    }
  }

  private normalizeSlug(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9]+/g, '-')    // replace non-alphanumeric with dash
      .replace(/^-+|-+$/g, '')         // trim dashes
      .substring(0, 60);
  }

  private async generateSlug(tenantId: string): Promise<string> {
    // Try to get business name from Authoriza
    try {
      const authorizaUrl = process.env.AUTHORIZA_API_URL || 'http://localhost:3000';
      const response = await fetch(`${authorizaUrl}/api/contracts/tenant/${tenantId}`);
      if (response.ok) {
        const contract = await response.json();
        const businessName = contract?.user?.basicData?.legalEntityData?.businessName ||
          contract?.user?.basicData?.naturalPersonData?.strFirstName ||
          contract?.businessName || '';
        if (businessName) {
          const slug = this.normalizeSlug(businessName);
          const existing = await this.marketplaceConfigRepository.findOne({ where: { slug } });
          if (!existing) return slug;
          return `${slug}-${Date.now().toString(36).slice(-4)}`;
        }
      }
    } catch {}
    // Fallback: use tenantId prefix
    return `tienda-${tenantId.substring(0, 8)}`;
  }
}