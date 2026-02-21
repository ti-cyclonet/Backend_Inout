import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import * as XLSX from 'xlsx';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
  ) {}

  async create(createCategoryDto: CreateCategoryDto, tenantId: string): Promise<Category> {
    try {
      // Generar código automático para la categoría
      const code = await this.generateCategoryCode(tenantId);

      const category = this.categoryRepository.create({
        ...createCategoryDto,
        code,
        tenantId,
        status: createCategoryDto.status || 'active',
      });

      return await this.categoryRepository.save(category);
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  }

  private async generateCategoryCode(tenantId: string): Promise<string> {
    // Obtener el prefijo del contrato desde Authoriza
    const prefix = await this.getContractPrefix(tenantId);
    
    // Buscar la última categoría creada para este tenant
    const lastCategory = await this.categoryRepository
      .createQueryBuilder('category')
      .where('category.tenantId = :tenantId', { tenantId })
      .andWhere('category.code LIKE :pattern', { pattern: `${prefix}-C-%` })
      .orderBy('category.id', 'DESC')
      .getOne();

    let nextNumber = 1;
    if (lastCategory && lastCategory.code) {
      const match = lastCategory.code.match(/-C-(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}-C-${nextNumber.toString().padStart(3, '0')}`;
  }

  private async getContractPrefix(tenantId: string): Promise<string> {
    try {
      // Consultar el prefijo del contrato desde Authoriza
      const authorizaUrl = process.env.AUTHORIZA_URL || 'http://localhost:3000/api';
      const response = await fetch(`${authorizaUrl}/contracts/tenant/${tenantId}`);
      
      if (response.ok) {
        const contract = await response.json();
        return contract.codePrefix || 'CAT';
      }
    } catch (error) {
      console.error('Error obteniendo prefijo del contrato:', error);
    }
    
    // Fallback a CAT si hay error
    return 'CAT';
  }

  async findAll(tenantId: string): Promise<Category[]> {
    return await this.categoryRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, tenantId: string): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id, tenantId },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return category;
  }

  async update(id: number, updateCategoryDto: Partial<CreateCategoryDto>, tenantId: string): Promise<Category> {
    const category = await this.findOne(id, tenantId);
    Object.assign(category, updateCategoryDto);
    return await this.categoryRepository.save(category);
  }

  async remove(id: number, tenantId: string): Promise<void> {
    const category = await this.findOne(id, tenantId);
    await this.categoryRepository.remove(category);
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

      const results = { success: 0, errors: [] };

      for (const row of data) {
        try {
          const categoryName = row['Nombre*'];
          
          const existingCategory = await this.categoryRepository.findOne({
            where: { name: categoryName, tenantId }
          });

          if (existingCategory) {
            results.errors.push({ row: categoryName, error: 'Categoría ya existe' });
            continue;
          }

          const categoryDto: CreateCategoryDto = {
            name: categoryName,
            description: row['Descripción'] || '',
            status: 'active'
          };

          await this.create(categoryDto, tenantId);
          results.success++;
        } catch (error) {
          results.errors.push({ row: row['Nombre*'], error: error.message });
        }
      }

      return {
        message: `Carga completada: ${results.success} categorías creadas`,
        success: results.success,
        errors: results.errors
      };
    } catch (error) {
      throw new BadRequestException('Error procesando el archivo: ' + error.message);
    }
  }
}
