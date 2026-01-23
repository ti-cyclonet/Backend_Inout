import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';

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
}
