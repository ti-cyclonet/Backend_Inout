import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { Application } from './entities/application.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { validate as isUUID } from 'uuid';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger('ApplicationsService');
  constructor(
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,

    private readonly dataSource: DataSource,

    private readonly cloudinaryService: CloudinaryService
  ) {}

  async create(createApplicationDto: CreateApplicationDto, file?: Express.Multer.File) {
    try {
      const { ...applicationDetails } = createApplicationDto;
  
      // Subir imagen a Cloudinary si se proporcionó un archivo
      // let imageUrl = '';
      // if (file) {
      //   const result = await this.cloudinaryService.uploadImage(file, 'logos-applications');
      //   imageUrl = result.secure_url;
      // }
  
      // Crear la aplicación con la URL de la imagen
      const application = this.applicationRepository.create({
        ...applicationDetails,
        // strUrlImage: imageUrl,
      });
  
      // Guardar la aplicación en la base de datos
      await this.applicationRepository.save(application);         
      return {
        ...application
      };
    } catch (error) {
      this.handleDBExcelption(error);
    }
  }  

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;
    
    const applications = await this.applicationRepository.find({
      take: limit,
      skip: offset,      
    });
    
    return await Promise.all(
      applications.map(async (application) => {
        return {
          ...application,
        };
      }),
    );
  }

  private handleDBExcelption(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException(
      `Unexpected error, check server logs`,
    );
  }

}
