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
import { MaterialT } from '../materials-t/entities/material-t.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { validate as isUUID } from 'uuid';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { LimitEnforcementService } from 'src/usage-counters/limit-enforcement.service';
import * as XLSX from 'xlsx';

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

    private readonly cloudinaryService: CloudinaryService,

    private readonly limitEnforcementService: LimitEnforcementService,
  ) {}

  async create(createMaterialDto: CreateMaterialDto, tenantId: string, registerActivity = true) {
    try {
      // 1. Generar código autoincremental
      const code = await this.generateMaterialCode(tenantId);

      // 2. Validar y subir imágenes a Cloudinary
      const imageUrls = [];
      if (createMaterialDto.images && createMaterialDto.images.length > 0) {
        for (const imageData of createMaterialDto.images) {
          if (imageData.url && imageData.url.startsWith('data:')) {
            const base64Data = imageData.url.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const result = await this.cloudinaryService.uploadImageFromBuffer(buffer, '/InOut/materials/');
            imageUrls.push(result.secure_url);
          }
        }
      }

      // 3. Crear material
      const { images, ...materialData } = createMaterialDto;
      const material = this.materialRepository.create({
        ...materialData,
        strCode: code,
        strName: materialData.strName.toUpperCase(),
        strTenantId: tenantId
      });
      const savedMaterial = await this.materialRepository.save(material);

      // 4. Crear registros de imágenes
      if (imageUrls.length > 0) {
        const materialImages = imageUrls.map(url => 
          this.materialImageRepository.create({
            strTenantId: tenantId,
            strEntityType: 'material',
            strEntityId: savedMaterial.strId,
            strImageUrl: url,
            strStatus: 'active'
          })
        );
        await this.materialImageRepository.save(materialImages);
      }

      // 5. Registrar actividad solo si se indica
      if (registerActivity) {
        await this.activityRepository.save({
          strTenantId: tenantId,
          strType: 'material_created',
          strTitle: `Nuevo material agregado: ${savedMaterial.strName}`,
          strIcon: 'plus-circle',
          strEntityId: savedMaterial.strId
        });
      }

      return savedMaterial;
    } catch (error) {
      this.handleDBException(error);
    }
  }

  async findAll(filters: any, tenantId: string) {
    const { limit = 10, page = 1, search, status, stockStatus, category, ubicacion } = filters;
    const offset = (page - 1) * limit;

    let queryBuilder = this.materialRepository.createQueryBuilder('material')
      .leftJoinAndSelect('material.category', 'category')
      .where('material.strTenantId = :tenantId', { tenantId });

    if (search) {
      queryBuilder = queryBuilder.andWhere(
        '(LOWER(material.strName) LIKE LOWER(:search) OR LOWER(material.strDescription) LIKE LOWER(:search))',
        { search: `%${search}%` }
      );
    }

    if (status && status !== 'all') {
      queryBuilder = queryBuilder.andWhere('LOWER(material.strStatus) = LOWER(:status)', { status });
    }

    if (category) {
      queryBuilder = queryBuilder.andWhere('material.categoryId = :category', { category: parseInt(category) });
    }

    if (stockStatus && stockStatus !== 'all') {
      if (stockStatus === 'low') {
        queryBuilder = queryBuilder.andWhere('material.ingQuantity < material.ingMinStock');
      } else if (stockStatus === 'normal') {
        queryBuilder = queryBuilder.andWhere('material.ingQuantity >= material.ingMinStock AND material.ingQuantity <= material.ingMaxStock');
      } else if (stockStatus === 'high') {
        queryBuilder = queryBuilder.andWhere('material.ingQuantity > material.ingMaxStock');
      }
    }

    const [materials, total] = await queryBuilder
      .orderBy('material.dtmUpdateDate', 'DESC')
      .addOrderBy('material.dtmCreationDate', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    const materialsWithImages = await Promise.all(
      materials.map(async (material) => {
        const images = await this.materialImageRepository.find({
          where: {
            strEntityId: material.strId,
            strEntityType: 'material',
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
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async findOne(term: string, tenantId: string): Promise<Material> {
    let material: Material;

    if (isUUID(term)) {
      material = await this.materialRepository.findOne({
        where: { strId: term, strTenantId: tenantId },
        relations: ['category']
      });
    } else {
      material = await this.materialRepository.findOne({
        where: { strName: term, strTenantId: tenantId },
        relations: ['category']
      });
    }

    if (!material) {
      throw new NotFoundException(`Material con identificador '${term}' no encontrado`);
    }

    // Obtener las imágenes del material
    const images = await this.materialImageRepository.find({
      where: {
        strEntityId: material.strId,
        strEntityType: 'material',
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

  async update(id: string, updateMaterialDto: UpdateMaterialDto, tenantId: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validar y subir nuevas imágenes a Cloudinary si existen
      const imageUrls = [];
      if (updateMaterialDto.images && updateMaterialDto.images.length > 0) {
        for (const imageData of updateMaterialDto.images) {
          if (imageData.url && imageData.url.startsWith('data:')) {
            const base64Data = imageData.url.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const result = await this.cloudinaryService.uploadImageFromBuffer(buffer, '/InOut/materials/');
            imageUrls.push(result.secure_url);
          }
        }
      }

      // 2. Actualizar material
      const { images, ...materialData } = updateMaterialDto;
      let material = await this.materialRepository.preload({
        strId: id,
        strTenantId: tenantId,
        ...materialData
      });

      if (!material) {
        throw new NotFoundException(`Material con id '${id}' no encontrado`);
      }

      material = await queryRunner.manager.save(material);

      // 3. Si hay nuevas imágenes, marcar las anteriores como inactivas y crear las nuevas
      if (imageUrls.length > 0) {
        await queryRunner.manager.update(
          MaterialImage,
          { strEntityId: id, strEntityType: 'material' },
          { strStatus: 'inactive' }
        );

        const materialImages = imageUrls.map(url => 
          this.materialImageRepository.create({
            strTenantId: tenantId,
            strEntityType: 'material',
            strEntityId: id,
            strImageUrl: url,
            strStatus: 'active'
          })
        );
        await queryRunner.manager.save(MaterialImage, materialImages);
      }

      await queryRunner.commitTransaction();
      await queryRunner.release();

      return material;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      this.handleDBException(error);
    }
  }

  async remove(id: string, tenantId: string) {
    const material = await this.findOne(id, tenantId);

    if (!material) {
      throw new NotFoundException(`Material con id '${id}' no encontrado`);
    }

    await this.materialRepository.remove(material);
    await this.limitEnforcementService.decrement(tenantId, 'nMateriales');
    return { message: `El material con id '${id}' fue eliminado exitosamente` };
  }

  async checkMaterialName(strName: string, tenantId: string): Promise<boolean> {
    const material = await this.materialRepository.findOne({ 
      where: { strName, strTenantId: tenantId } 
    });
    return !material;
  }

  async createTransformed(createMaterialDto: any, tenantId: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Crear el material transformado
      const { composition, ...materialData } = createMaterialDto;
      const material = this.materialRepository.create({
        ...materialData,
        strName: materialData.strName.toUpperCase(),
        strTenantId: tenantId
      });
      const savedMaterial = await this.materialRepository.save(material);

      // 2. Crear las relaciones de composición (si tienes tabla de composición)
      // Por ahora solo guardamos el material

      // 3. Registrar actividad
      await queryRunner.manager.save(Activity, {
        strTenantId: tenantId,
        strType: 'material_transformed_created',
        strTitle: `Material transformado creado: ${(savedMaterial as unknown as Material).strName}`,
        strIcon: 'diagram-3',
        strEntityId: (savedMaterial as unknown as Material).strId
      });

      await queryRunner.commitTransaction();
      return savedMaterial;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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
    // Get regular materials only (excluding transformed materials)
    const materials = await this.materialRepository.find({
      where: { strTenantId: tenantId }
    });
    
    const totalMaterials = materials.length;
    const activeCount = materials.filter(m => m.strStatus.toLowerCase() === 'active').length;
    const inactiveCount = materials.filter(m => m.strStatus.toLowerCase() === 'inactive').length;
    const lowStockCount = materials.filter(m => Number(m.ingQuantity) < Number(m.ingMinStock)).length;
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
      take: 6
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

  private async generateMaterialCode(tenantId: string): Promise<string> {
    // Obtener el prefijo del contrato del tenant desde Authoriza
    const prefix = await this.getContractPrefix(tenantId);
    
    // Buscar el último material creado para este tenant
    const lastMaterial = await this.materialRepository
      .createQueryBuilder('material')
      .where('material.strTenantId = :tenantId', { tenantId })
      .andWhere('material.strCode IS NOT NULL')
      .andWhere('material.strCode LIKE :pattern', { pattern: `${prefix}-M-%` })
      .orderBy('material.strCode', 'DESC')
      .getOne();

    let nextNumber = 1;
    if (lastMaterial && lastMaterial.strCode) {
      const lastNumber = parseInt(lastMaterial.strCode.split('-')[2]);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}-M-${nextNumber.toString().padStart(5, '0')}`;
  }

  private async getContractPrefix(tenantId: string): Promise<string> {
    try {
      // Consultar el prefijo del contrato desde Authoriza
      const authorizaUrl = process.env.AUTHORIZA_URL || 'http://localhost:3000/api';
      const response = await fetch(`${authorizaUrl}/contracts/tenant/${tenantId}`);
      
      if (response.ok) {
        const contract = await response.json();
        return contract.codePrefix || 'ABC';
      }
    } catch (error) {
      console.error('Error obteniendo prefijo del contrato:', error);
    }
    
    // Fallback a ABC si hay error
    return 'ABC';
  }

  async bulkUpload(file: Express.Multer.File, tenantId: string) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      if (data.length === 0) {
        throw new BadRequestException('El archivo está vacío');
      }

      // === VALIDACIÓN DE LÍMITE DE USO ===
      // Verificar cuántos materiales puede crear según su paquete
      const limitsResponse = await this.limitEnforcementService.fetchLimits(tenantId);
      const materialLimit = limitsResponse.limits.find(l => l.variableName === 'nMateriales');
      
      if (materialLimit) {
        // Obtener el contador actual
        const counters = await this.limitEnforcementService.getCounters(tenantId);
        const currentCounter = counters.find(c => c.variableName === 'nMateriales');
        const currentCount = currentCounter?.currentCount ?? 0;
        const maxValue = materialLimit.maxValue;
        const availableSlots = maxValue - currentCount;

        if (availableSlots <= 0) {
          throw new BadRequestException(
            `Límite alcanzado: Ya tienes ${currentCount}/${maxValue} materiales. ` +
            `Tu paquete "${limitsResponse.packageName}" no permite crear más materiales. ` +
            `Actualiza tu plan para continuar.`
          );
        }

        if (data.length > availableSlots) {
          throw new BadRequestException(
            `Límite excedido: Intentas cargar ${data.length} materiales, pero solo puedes crear ${availableSlots} más. ` +
            `Tu paquete "${limitsResponse.packageName}" permite un máximo de ${maxValue} materiales ` +
            `y ya tienes ${currentCount} creados.`
          );
        }
      }
      // === FIN VALIDACIÓN DE LÍMITE ===

      const results = { success: 0, errors: [] };

      for (const row of data) {
        try {
          const materialName = row['Nombre*'];
          const categoryId = parseInt(row['ID Categoría*']);
          
          // Verificar si ya existe un material con ese nombre para este tenant
          const existingMaterial = await this.materialRepository.findOne({
            where: { 
              strName: materialName.toUpperCase(), 
              strTenantId: tenantId 
            }
          });

          if (existingMaterial) {
            results.errors.push({ 
              row: materialName, 
              error: 'Material ya existe para este tenant' 
            });
            continue;
          }

          // Verificar si la categoría existe para este tenant
          const categoryExists = await this.dataSource.query(
            'SELECT id FROM categories WHERE id = $1 AND "tenantId" = $2',
            [categoryId, tenantId]
          );

          if (!categoryExists || categoryExists.length === 0) {
            results.errors.push({ 
              row: materialName, 
              error: `Categoría con ID ${categoryId} no existe para este tenant` 
            });
            continue;
          }

          const materialDto: CreateMaterialDto = {
            strName: materialName,
            strDescription: row['Descripción'] || '',
            fltPrice: parseFloat(row['Precio']) || 0,
            strUnitMeasure: this.normalizeUnit(row['Unidad Medida*']),
            strDischargeUnit: this.normalizeUnit(row['Unidad Descarga*']),
            ingMaxStock: parseInt(row['Stock Máximo*']) || 0,
            ingMinStock: parseInt(row['Stock Mínimo*']) || 0,
            ingQuantity: 0,
            strLocation: row['Ubicación'] || '',
            categoryId: categoryId,
            strStatus: 'Active',
            blnBulkUpload: true
          };

          await this.create(materialDto, tenantId, false);
          results.success++;
        } catch (error) {
          results.errors.push({ row: row['Nombre*'], error: error.message });
        }
      }

      // Incrementar el contador de uso por la cantidad de materiales creados exitosamente
      if (results.success > 0) {
        for (let i = 0; i < results.success; i++) {
          await this.limitEnforcementService.validateAndIncrement(tenantId, 'nMateriales').catch(() => {
            // Si falla el incremento individual, intentar con query directa
          });
        }
      }

      // Registrar actividad de carga masiva
      await this.activityRepository.save({
        strTenantId: tenantId,
        strType: 'bulk_upload',
        strTitle: `${results.success} materiales cargados por carga masiva`,
        strIcon: 'upload',
        strEntityId: null
      });

      return {
        message: `Carga completada: ${results.success} materiales creados`,
        success: results.success,
        errors: results.errors
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error procesando el archivo: ' + error.message);
    }
  }

  async bulkValidate(file: Express.Multer.File, tenantId: string) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    try {
      this.logger.log(`Validando archivo: ${file.originalname}, tamaño: ${file.size} bytes`);
      this.logger.log(`Buffer existe: ${!!file.buffer}, Buffer length: ${file.buffer?.length}`);
      
      if (!file.buffer || file.buffer.length === 0) {
        return { valid: false, message: 'El archivo está vacío o no se pudo leer', errors: [], totalRows: 0, validRows: 0 };
      }
      
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      
      this.logger.log(`Hojas encontradas: ${JSON.stringify(workbook.SheetNames)}`);
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        return { valid: false, message: 'El archivo no contiene hojas de cálculo', errors: [], totalRows: 0, validRows: 0 };
      }
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      this.logger.log(`Procesando hoja: ${sheetName}`);
      
      if (!worksheet) {
        return { valid: false, message: 'No se pudo leer la hoja de cálculo', errors: [], totalRows: 0, validRows: 0 };
      }
      
      const data = XLSX.utils.sheet_to_json(worksheet);

      this.logger.log(`Filas leídas: ${data ? data.length : 0}`);
      this.logger.log(`Datos: ${JSON.stringify(data).substring(0, 500)}`);

      if (!data || data.length === 0) {
        return { valid: false, message: 'La hoja de cálculo está vacía. Debe contener al menos una fila de datos además del encabezado', errors: [], totalRows: 0, validRows: 0 };
      }

      // === VALIDACIÓN DE LÍMITE DE USO ===
      let limitWarning: string | null = null;
      try {
        const limitsResponse = await this.limitEnforcementService.fetchLimits(tenantId);
        const materialLimit = limitsResponse.limits.find(l => l.variableName === 'nMateriales');
        
        if (materialLimit) {
          const counters = await this.limitEnforcementService.getCounters(tenantId);
          const currentCounter = counters.find(c => c.variableName === 'nMateriales');
          const currentCount = currentCounter?.currentCount ?? 0;
          const maxValue = materialLimit.maxValue;
          const availableSlots = maxValue - currentCount;

          if (availableSlots <= 0) {
            return {
              valid: false,
              message: `Límite alcanzado: Ya tienes ${currentCount}/${maxValue} materiales. Tu paquete "${limitsResponse.packageName}" no permite crear más. Actualiza tu plan.`,
              errors: [],
              totalRows: data.length,
              validRows: 0,
              limitExceeded: true,
              packageName: limitsResponse.packageName,
              currentCount,
              maxValue
            };
          }

          if (data.length > availableSlots) {
            return {
              valid: false,
              message: `Límite excedido: Intentas cargar ${data.length} materiales, pero solo puedes crear ${availableSlots} más. Tu paquete "${limitsResponse.packageName}" permite máximo ${maxValue} materiales (tienes ${currentCount}).`,
              errors: [],
              totalRows: data.length,
              validRows: 0,
              limitExceeded: true,
              packageName: limitsResponse.packageName,
              currentCount,
              maxValue,
              availableSlots
            };
          }

          // Advertencia si se acerca al límite
          const percentageAfterUpload = ((currentCount + data.length) / maxValue) * 100;
          if (percentageAfterUpload >= 80) {
            limitWarning = `Atención: Después de esta carga tendrás ${currentCount + data.length}/${maxValue} materiales (${Math.round(percentageAfterUpload)}% de tu límite en "${limitsResponse.packageName}").`;
          }
        }
      } catch (limitError) {
        this.logger.warn(`Could not validate limits: ${limitError.message}`);
      }
      // === FIN VALIDACIÓN DE LÍMITE ===

      const errors = [];
      const validRows = [];
      const requiredColumns = ['Nombre*', 'Unidad Medida*', 'Unidad Descarga*', 'Stock Máximo*', 'Stock Mínimo*', 'ID Categoría*'];
      const firstRow = data[0] as any;
      const availableColumns = Object.keys(firstRow);
      
      this.logger.log(`Columnas disponibles: ${JSON.stringify(availableColumns)}`);
      this.logger.log(`Columnas requeridas: ${JSON.stringify(requiredColumns)}`);
      
      const missingColumns = requiredColumns.filter(col => !(col in firstRow));

      if (missingColumns.length > 0) {
        return { 
          valid: false, 
          message: `Faltan columnas requeridas: ${missingColumns.join(', ')}. Descarga la plantilla para ver el formato correcto`, 
          errors: [], 
          totalRows: 0, 
          validRows: 0 
        };
      }

      for (let i = 0; i < data.length; i++) {
        const row = data[i] as any;
        const rowErrors = [];

        if (!row['Nombre*']) rowErrors.push('Nombre requerido');
        if (!row['Unidad Medida*']) rowErrors.push('Unidad Medida requerida');
        if (!row['Unidad Descarga*']) rowErrors.push('Unidad Descarga requerida');
        if (!row['Stock Máximo*']) rowErrors.push('Stock Máximo requerido');
        if (!row['Stock Mínimo*']) rowErrors.push('Stock Mínimo requerido');
        if (!row['ID Categoría*']) rowErrors.push('ID Categoría requerido');

        if (rowErrors.length > 0) {
          errors.push({ row: i + 2, name: row['Nombre*'] || 'Sin nombre', errors: rowErrors });
        } else {
          validRows.push(row);
        }
      }

      const result: any = {
        valid: errors.length === 0,
        message: errors.length === 0 ? `${data.length} materiales listos para cargar` : `${errors.length} errores encontrados en ${data.length} filas`,
        errors,
        totalRows: data.length,
        validRows: validRows.length
      };

      if (limitWarning) {
        result.limitWarning = limitWarning;
      }

      return result;
    } catch (error) {
      this.logger.error('Error validating file:', error);
      this.logger.error('Stack:', error.stack);
      return { 
        valid: false, 
        message: `Error al leer el archivo: ${error.message || 'Formato inválido'}. Asegúrate de usar un archivo Excel (.xlsx)`, 
        errors: [], 
        totalRows: 0, 
        validRows: 0 
      };
    }
  }

  private normalizeUnit(unit: string): string {
    const unitMap = {
      'miligramos': 'mg',
      'gramos': 'g',
      'kilogramos': 'kg',
      'libras': 'lb',
      'onzas': 'oz',
      'mililitros': 'ml',
      'litros': 'l',
      'galones': 'gal',
      'centimetros': 'cm',
      'metros': 'm',
      'pulgadas': 'in',
      'pies': 'ft',
      'metros cuadrados': 'm²',
      'metros cúbicos': 'm³',
      'unidades': 'und',
      'piezas': 'pza',
      'cajas': 'cja',
      'paquetes': 'pqt',
      'docentas': 'doc'
    };
    
    const normalized = unit.toLowerCase().trim();
    return unitMap[normalized] || unit;
  }
}
