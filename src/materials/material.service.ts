import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { Material } from './entities/material.entity';
import { MaterialImage } from './entities/material-image.entity';
import { Activity } from './entities/activity.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { validate as isUUID } from 'uuid';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@Injectable()
export class MaterialsService {
  private readonly logger = new Logger('MaterialsService');

  constructor(
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,

    @InjectRepository(MaterialImage)
    private readonly materialImageRepository: Repository<MaterialImage>,

    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,

    private readonly dataSource: DataSource,

    private readonly cloudinaryService: CloudinaryService
  ) {}

  async create(createMaterialDto: CreateMaterialDto, tenantId: string) {
    try {
      // 1. Validar y subir imágenes a Cloudinary
      const imageUrls = [];
      if (createMaterialDto.images && createMaterialDto.images.length > 0) {
        for (const imageData of createMaterialDto.images) {
          if (imageData.url && imageData.url.startsWith('data:')) {
            const base64Data = imageData.url.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const result = await this.cloudinaryService.uploadImageFromBuffer(buffer, '/InOut/images/materials');
            imageUrls.push(result.secure_url);
          }
        }
      }

      // 2. Crear material
      const { images, ...materialData } = createMaterialDto;
      const material = this.materialRepository.create({
        ...materialData,
        strTenantId: tenantId
      });
      const savedMaterial = await this.materialRepository.save(material);

      // 3. Crear registros de imágenes
      if (imageUrls.length > 0) {
        const materialImages = imageUrls.map(url => 
          this.materialImageRepository.create({
            strTenantId: tenantId,
            strMaterialId: savedMaterial.strId,
            strImageUrl: url,
            strStatus: 'active'
          })
        );
        await this.materialImageRepository.save(materialImages);
      }

      // 4. Registrar actividad
      await this.activityRepository.save({
        strTenantId: tenantId,
        strType: 'material_created',
        strTitle: `Nuevo material agregado: ${savedMaterial.strName}`,
        strIcon: 'plus-circle',
        strEntityId: savedMaterial.strId
      });

      return savedMaterial;
    } catch (error) {
      this.handleDBException(error);
    }
  }

  async findAll(paginationDto: PaginationDto, tenantId: string) {
    const { limit = 10, page = 1 } = paginationDto;
    const offset = (page - 1) * limit;

    const [materials, total] = await this.materialRepository.findAndCount({
      where: { strTenantId: tenantId },
      take: limit,
      skip: offset,
      relations: ['images']
    });

    return {
      data: materials,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async findOne(term: string): Promise<Material> {
    let material: Material;

    if (isUUID(term)) {
      material = await this.materialRepository.findOne({
        where: { strId: term },
      });
    } else {
      material = await this.materialRepository.findOne({
        where: { strName: term },
      });
    }

    if (!material) {
      throw new NotFoundException(`Material con identificador '${term}' no encontrado`);
    }

    return material;
  }

  async update(id: string, updateMaterialDto: UpdateMaterialDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let material = await this.materialRepository.preload({
        strId: id,
        ...updateMaterialDto,
      });

      if (!material) {
        throw new NotFoundException(`Material con id '${id}' no encontrado`);
      }

      material = await queryRunner.manager.save(material);
      await queryRunner.commitTransaction();
      await queryRunner.release();

      return material;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      this.handleDBException(error);
    }
  }

  async remove(id: string) {
    const material = await this.findOne(id);

    if (!material) {
      throw new NotFoundException(`Material con id '${id}' no encontrado`);
    }

    await this.materialRepository.remove(material);
    return { message: `El material con id '${id}' fue eliminado exitosamente` };
  }

  async checkMaterialName(strName: string): Promise<boolean> {
    const material = await this.materialRepository.findOne({ where: { strName } });
    return !material;
  }

  async deleteAllMaterials() {
    try {
      return await this.materialRepository.createQueryBuilder('material').delete().where({}).execute();
    } catch (error) {
      this.handleDBException(error);
    }
  }

  private handleDBException(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException(`Unexpected error, check server logs`);
  }

  async getMetrics(tenantId: string) {
    const materials = await this.materialRepository.find({
      where: { strTenantId: tenantId }
    });
    
    const totalMaterials = materials.length;
    const activeCount = materials.filter(m => m.strStatus.toLowerCase() === 'active').length;
    const inactiveCount = materials.filter(m => m.strStatus.toLowerCase() === 'inactive').length;
    const lowStockCount = materials.filter(m => m.ingQuantity < m.ingMinStock).length;
    const totalValue = materials.reduce((sum, m) => sum + (m.fltPrice * m.ingQuantity), 0);

    return {
      totalMaterials,
      lowStockCount,
      totalValue,
      activeCount,
      inactiveCount
    };
  }

  async getActivities(tenantId: string) {
    const activities = await this.activityRepository.find({
      where: { strTenantId: tenantId },
      order: { dtmCreationDate: 'DESC' },
      take: 10
    });

    return activities.map(activity => ({
      id: activity.strId,
      title: activity.strTitle,
      icon: activity.strIcon,
      type: activity.strType === 'material_created' ? 'success' : 'info',
      time: this.getTimeAgo(activity.dtmCreationDate)
    }));
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
    if (diffHours > 0) return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    return 'Hace unos minutos';
  }
}
