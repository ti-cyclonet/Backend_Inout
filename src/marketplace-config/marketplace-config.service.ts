import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketplaceConfig } from './entities/marketplace-config.entity';
import { PlatformSetting } from './entities/platform-setting.entity';
import { HOME_THEME_KEY, isHomeTheme } from './home/home-theme';
import { isReservedSlug } from './home/reserved-slugs';
import { UpdateMarketplaceConfigDto } from './dto/update-marketplace-config.dto';
import { StoreInfo, storeInfoFrom } from './store-info';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { MENU_EXTRA_IMAGE_MAX_BYTES, MENU_EXTRA_IMAGE_TYPES, MenuExtras, removedImagePublicIds, resolveMenuExtras } from './menu-extras';

@Injectable()
export class MarketplaceConfigService {
  constructor(
    @InjectRepository(MarketplaceConfig)
    private readonly marketplaceConfigRepository: Repository<MarketplaceConfig>,
    @InjectRepository(PlatformSetting)
    private readonly platformSettings: Repository<PlatformSetting>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /**
   * Configuración de la tienda; si aún no existe se crea (con su slug). Antes
   * había que guardar primero los "productos visibles" y los demás ajustes
   * respondían 404; la visibilidad ahora se decide en cada producto o material.
   */
  async configFor(tenantId: string): Promise<MarketplaceConfig> {
    const existing = await this.marketplaceConfigRepository.findOne({ where: { tenantId } });
    if (existing) return existing;
    return this.marketplaceConfigRepository.save(this.marketplaceConfigRepository.create({
      tenantId,
      selectedProductIds: [],
      displayMode: 'grid',
      slug: await this.generateSlug(tenantId),
    }));
  }

  async updateConfig(dto: UpdateMarketplaceConfigDto): Promise<MarketplaceConfig> {
    let config = await this.marketplaceConfigRepository.findOne({
      where: { tenantId: dto.tenantId },
    });

    if (config) {
      if (dto.selectedProductIds) config.selectedProductIds = dto.selectedProductIds;
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
        selectedProductIds: dto.selectedProductIds || [],
        displayMode: dto.displayMode || 'grid',
        slug,
      });
    }

    return await this.marketplaceConfigRepository.save(config);
  }

  /** Guarda las formas de pago (ya normalizadas con resolvePaymentOptions). */
  async updatePaymentOptions(tenantId: string, paymentOptions: Record<string, any>) {
    const config = await this.configFor(tenantId);
    config.paymentOptions = paymentOptions;
    await this.marketplaceConfigRepository.save(config);
    return paymentOptions;
  }

  /** Guarda la programación de pedidos (ya normalizada con resolveScheduling). */
  /** Formas de entrega (ya validadas con validateDeliveryOptions). */
  async updateGiftCards(tenantId: string, options: Record<string, any>) {
    const config = await this.configFor(tenantId);
    config.giftCards = options;
    await this.marketplaceConfigRepository.save(config);
    return options;
  }

  async updateDeliveryOptions(tenantId: string, options: Record<string, any>) {
    const config = await this.configFor(tenantId);
    config.deliveryOptions = options;
    await this.marketplaceConfigRepository.save(config);
    return options;
  }

  async updateScheduling(tenantId: string, scheduling: Record<string, any>) {
    const config = await this.configFor(tenantId);
    config.scheduling = scheduling;
    await this.marketplaceConfigRepository.save(config);
    return scheduling;
  }

  /** Guarda los textos de agradecimiento (ya normalizados con resolveThanksMessages). */
  async updateThanksMessages(tenantId: string, thanksMessages: Record<string, any>) {
    const config = await this.configFor(tenantId);
    config.thanksMessages = thanksMessages;
    await this.marketplaceConfigRepository.save(config);
    return thanksMessages;
  }

  /** WhatsApp y mensaje de bienvenida (ya validados). Vacío se guarda como null. */
  async updateStoreInfo(tenantId: string, info: StoreInfo): Promise<StoreInfo> {
    const config = await this.configFor(tenantId);
    config.whatsapp = info.whatsapp || null;
    config.welcomeMessage = info.welcomeMessage || null;
    await this.marketplaceConfigRepository.save(config);
    return storeInfoFrom(config);
  }

  /** Información de la carta (ya normalizada). Borra de Cloudinary las fotos que se quitaron. */
  async updateMenuExtras(tenantId: string, extras: MenuExtras): Promise<MenuExtras> {
    const config = await this.configFor(tenantId);
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

  /** Tema de la vitrina CycloNet Market ('grid' si no se ha elegido). */
  async getHomeTheme(): Promise<string> {
    const row = await this.platformSettings.findOne({ where: { key: HOME_THEME_KEY } });
    return isHomeTheme(row?.value) ? row!.value : 'grid';
  }

  async setHomeTheme(displayMode: string): Promise<string> {
    await this.platformSettings.save({ key: HOME_THEME_KEY, value: displayMode });
    return displayMode;
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
    if (isReservedSlug(slug)) {
      throw new ConflictException(`"${slug}" está reservado para CycloNet Market. Elige otro nombre para tu tienda.`);
    }
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
          if (!existing && !isReservedSlug(slug)) return slug;
          return `${slug}-${Date.now().toString(36).slice(-4)}`;
        }
      }
    } catch {}
    // Fallback: use tenantId prefix
    return `tienda-${tenantId.substring(0, 8)}`;
  }
}