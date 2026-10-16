import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import { UploadApiResponse } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import { reportPlatformUsage } from '../common/platform-usage';

/** Cliente dueño de la subida: el indicado o el de la carpeta ("inout/tenants/<id>/menu"). */
export function uploadTenant(folder: string, tenantId?: string | null): string | null {
  if (tenantId) return tenantId;
  const m = /(?:^|\/)tenants\/([0-9a-f-]{36})(?:\/|$)/i.exec(folder || '');
  return m ? m[1] : null;
}

/** Consumo de Cloudinary (por cliente) para los indicadores de costos de Authoriza. */
function trackUpload(result: { bytes?: number } | undefined, tenantId: string | null) {
  reportPlatformUsage({ platform: 'CLOUDINARY', metric: 'uploads', quantity: 1, tenantId });
  if (result?.bytes) reportPlatformUsage({ platform: 'CLOUDINARY', metric: 'upload_bytes', quantity: result.bytes, tenantId });
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

  async uploadImageFromBuffer(buffer: Buffer, folder: string, tenantId?: string | null): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: this.prefixFolder(folder) },
        (error, result) => {
          if (error) return reject(error);
          trackUpload(result, uploadTenant(folder, tenantId));
          resolve(result);
        }
      ).end(buffer);
    });
  }

  async uploadImage(file: Express.Multer.File, folder: string, tenantId?: string | null): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(file.path, { folder: this.prefixFolder(folder) }, (error, result) => {
        if (error) return reject(error);
        trackUpload(result, uploadTenant(folder, tenantId));
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
