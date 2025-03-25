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

    private readonly dataSource: DataSource,

    private readonly cloudinaryService: CloudinaryService
  ) {}

  async create(createMaterialDto: CreateMaterialDto, file?: Express.Multer.File) {
    try {
      let imageUrl = '';
      if (file) {
        const result = await this.cloudinaryService.uploadImage(file, 'materials-images');
        imageUrl = result.secure_url;
      }

      const material = this.materialRepository.create({
        ...createMaterialDto,
        strUrlImage: imageUrl,
      });

      await this.materialRepository.save(material);
      return material;
    } catch (error) {
      this.handleDBException(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;

    return await this.materialRepository.find({
      take: limit,
      skip: offset,
    });
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
}
