import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import { UploadApiResponse } from 'cloudinary';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CloudinaryService {
    constructor(private configService: ConfigService) {
      }
  async uploadImage(file: Express.Multer.File, folder: string): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(file.path, { folder }, (error, result) => {
        if (error) return reject(error);
        
        // Elimina el archivo temporal después de la carga exitosa
        fs.unlink(file.path, (err) => {
          if (err) console.error("Error deleting temporary file:", err);
        });

        resolve(result);
      });
    });
  }
}
