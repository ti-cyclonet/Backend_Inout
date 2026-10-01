import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import { UploadApiResponse } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import { reportPlatformUsage } from '../common/platform-usage';

/** Consumo de Cloudinary para los indicadores de costos de Authoriza. */
function trackUpload(result: { bytes?: number } | undefined) {
  reportPlatformUsage({ platform: 'CLOUDINARY', metric: 'uploads', quantity: 1 });
  if (result?.bytes) reportPlatformUsage({ platform: 'CLOUDINARY', metric: 'upload_bytes', quantity: result.bytes });
}

@Injectable()
export class CloudinaryService {
  private folderPrefix: string;

  constructor(private configService: ConfigService) {
    this.folderPrefix = this.configService.get<string>('CLOUDINARY_FOLDER_PREFIX') || '';
  }

  private prefixFolder(folder: string): string {
    return this.folderPrefix ? `${this.folderPrefix}/${folder.replace(/^\//, '')}` : folder.replace(/^\//, '');
  }

  async uploadImageFromBuffer(buffer: Buffer, folder: string): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: this.prefixFolder(folder) },
        (error, result) => {
          if (error) return reject(error);
          trackUpload(result);
          resolve(result);
        }
      ).end(buffer);
    });
  }

  async uploadImage(file: Express.Multer.File, folder: string): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(file.path, { folder: this.prefixFolder(folder) }, (error, result) => {
        if (error) return reject(error);
        trackUpload(result);
        fs.unlink(file.path, (err) => {
          if (err) console.error("Error deleting temporary file:", err);
        });
        resolve(result);
      });
    });
  }

  /** Borra un recurso por su public_id (p. ej. el logo reemplazado). */
  async destroy(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}
