import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
  } from '@nestjs/common';
  import { CreateMaterialTDto } from './dto/create-material-t.dto';
  import { UpdateMaterialTDto } from './dto/update-material-t.dto';
  import { MaterialT, CompositionOne } from './entities';
  import { Activity } from '../materials/entities/activity.entity';
  import { Material } from '../materials/entities/material.entity';
  import { MaterialImage } from '../materials/entities/material-image.entity';
  import { InjectRepository } from '@nestjs/typeorm';
  import { DataSource, Repository } from 'typeorm';
  import { PaginationDto } from 'src/common/dtos/pagination.dto';
  import { validate as isUUID } from 'uuid';
  import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
  
  @Injectable()
  export class MaterialsTService {
    private readonly logger = new Logger('MaterialsService');
  
    constructor(
      @InjectRepository(MaterialT)
      private readonly materialRepository: Repository<MaterialT>,

      @InjectRepository(CompositionOne)
      private readonly compositionRepository: Repository<CompositionOne>,

      @InjectRepository(Activity)
      private readonly activityRepository: Repository<Activity>,

      @InjectRepository(Material)
      private readonly materialBaseRepository: Repository<Material>,

      @InjectRepository(MaterialImage)
      private readonly materialImageRepository: Repository<MaterialImage>,
  
      private readonly dataSource: DataSource,
  
      private readonly cloudinaryService: CloudinaryService
    ) {}
  
    async create(createMaterialDto: CreateMaterialTDto, tenantId: string) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // 1. Subir imágenes a Cloudinary si existen
        const { images, uploadedFiles, ...materialData } = createMaterialDto as any;
        const imageUrls = [];
        
        // Handle uploaded files first (from multipart/form-data)
        if (uploadedFiles && uploadedFiles.length > 0) {
          for (const file of uploadedFiles) {
            const result = await this.cloudinaryService.uploadImage(file, '/InOut/materials-t/');
            imageUrls.push(result.secure_url);
          }
        }
        
        // Handle images array (base64 or blob URLs)
        if (images && images.length > 0) {
          for (const imageData of images) {
            // Handle base64 data URLs
            if (imageData.url && imageData.url.startsWith('data:')) {
              const base64Data = imageData.url.split(',')[1];
              const buffer = Buffer.from(base64Data, 'base64');
              const result = await this.cloudinaryService.uploadImageFromBuffer(buffer, '/InOut/materials-t/');
              imageUrls.push(result.secure_url);
            }
            // Handle file objects (from FormData)
            else if (imageData.file && Object.keys(imageData.file).length > 0) {
              // If file object has buffer data
              if (imageData.file.buffer) {
                const result = await this.cloudinaryService.uploadImageFromBuffer(imageData.file.buffer, '/InOut/materials-t/');
                imageUrls.push(result.secure_url);
              }
              // If file object has path
              else if (imageData.file.path) {
                const result = await this.cloudinaryService.uploadImage(imageData.file, '/InOut/materials-t/');
                imageUrls.push(result.secure_url);
              }
            }
          }
        }

        const material = this.materialRepository.create({
          ...materialData,
          strName: materialData.strName.toUpperCase(),
          strTenantId: tenantId,
        });

        const savedMaterial = await queryRunner.manager.save(material) as unknown as MaterialT;

        // 2. Crear registros de imágenes
        if (imageUrls.length > 0) {
          const materialImages = imageUrls.map(url => 
            this.materialImageRepository.create({
              strTenantId: tenantId,
              strEntityType: 'material-t',
              strEntityId: savedMaterial.strId,
              strImageUrl: url,
              strStatus: 'active'
            })
          );
          await queryRunner.manager.save(materialImages);
        }

        // Save compositions if provided
        if (materialData.composition && materialData.composition.length > 0) {
          const compositions = materialData.composition.map(comp => 
            this.compositionRepository.create({
              strMaterialTId: savedMaterial.strId,
              strComponentMaterialId: comp.componentMaterialId,
              fltQuantity: comp.quantity
            })
          );
          
          await queryRunner.manager.save(compositions);
          
          // Update stock of component materials
          for (const comp of materialData.composition) {
            await queryRunner.manager.decrement(
              Material,
              { strId: comp.componentMaterialId },
              'ingQuantity',
              comp.quantity
            );
          }
        }

        // Save activity
        await queryRunner.manager.save(Activity, {
          strTenantId: tenantId,
          strType: 'material_transformed_created',
          strTitle: `Material compuesto creado: ${savedMaterial.strName}`,
          strIcon: 'diagram-3',
          strEntityId: savedMaterial.strId
        });

        await queryRunner.commitTransaction();
        return savedMaterial;
      } catch (error) {
        await queryRunner.rollbackTransaction();
        this.handleDBException(error);
      } finally {
        await queryRunner.release();
      }
    }
  
    async findAll(paginationDto: PaginationDto, tenantId?: string) {
      const { limit = 10, offset = 0 } = paginationDto;
  
      const whereCondition = tenantId ? { strTenantId: tenantId } : {};
      
      const [materials, total] = await this.materialRepository.findAndCount({
        where: whereCondition,
        take: limit,
        skip: offset,
      });

      // Obtener las imágenes para cada material compuesto
      const materialsWithImages = await Promise.all(
        materials.map(async (material) => {
          const images = await this.materialImageRepository.find({
            where: {
              strEntityId: material.strId,
              strEntityType: 'material-t',
              strStatus: 'active'
            }
          });
          return {
            ...material,
            images: images.map(img => ({
              strId: img.strId,
              strImageUrl: img.strImageUrl
            }))
          };
        })
      );

      return {
        data: materialsWithImages,
        total,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    }
  
    async findOne(term: string): Promise<MaterialT> {
      let material: MaterialT;
  
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

      // Obtener las imágenes del material compuesto
      const images = await this.materialImageRepository.find({
        where: {
          strEntityId: material.strId,
          strEntityType: 'material-t',
          strStatus: 'active'
        }
      });

      return {
        ...material,
        images: images.map(img => ({
          strId: img.strId,
          strImageUrl: img.strImageUrl
        }))
      } as any;
    }
  
    async update(id: string, updateMaterialDto: UpdateMaterialTDto) {
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

    async getCompositions(materialTId: string) {
      return await this.compositionRepository.find({
        where: { strMaterialTId: materialTId }
      });
    }
  
    private handleDBException(error: any) {
      if (error.code === '23505') throw new BadRequestException(error.detail);
      this.logger.error(error);
      throw new InternalServerErrorException(`Unexpected error, check server logs`);
    }
  }