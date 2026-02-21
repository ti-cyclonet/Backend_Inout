import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductComposition } from './entities/product-composition.entity';
import { CompositionTwo } from './entities/composition-two.entity';
import { CompositionThree } from './entities/composition-three.entity';
import { ProductProduction } from './entities/product-production.entity';
import { Material } from '../materials/entities/material.entity';
import { MaterialImage } from '../materials/entities/material-image.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductComposition)
    private compositionRepository: Repository<ProductComposition>,
    @InjectRepository(CompositionTwo)
    private compositionTwoRepository: Repository<CompositionTwo>,
    @InjectRepository(CompositionThree)
    private compositionThreeRepository: Repository<CompositionThree>,
    @InjectRepository(ProductProduction)
    private productionRepository: Repository<ProductProduction>,
    @InjectRepository(Material)
    private materialRepository: Repository<Material>,
    @InjectRepository(MaterialImage)
    private imageRepository: Repository<MaterialImage>,
    private dataSource: DataSource,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(createDto: CreateProductDto, tenantId: string): Promise<Product> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const code = await this.generateProductCode(tenantId);
      const { composition, compositionTwo, compositionThree, images, categoryId, ...productData } = createDto;
      
      const product = this.productRepository.create({
        ...productData,
        strCode: code,
        strTenantId: tenantId,
        strName: productData.strName.toUpperCase(),
        intCategoryId: categoryId,
      });

      const savedProduct = await queryRunner.manager.save(product);

      // Save old composition (backward compatibility)
      if (composition && composition.length > 0) {
        const compositions = composition.map(comp =>
          this.compositionRepository.create({
            strProductId: savedProduct.strId,
            strMaterialId: comp.materialId,
            fltQuantity: comp.quantity,
          })
        );
        await queryRunner.manager.save(compositions);
      }

      // Save compositionTwo (MATERIALS -> PRODUCTS)
      if (compositionTwo && compositionTwo.length > 0) {
        const compositionsTwo = compositionTwo.map(comp =>
          this.compositionTwoRepository.create({
            strProductId: savedProduct.strId,
            strMaterialId: comp.componentMaterialId,
            fltQuantity: comp.quantity,
          })
        );
        await queryRunner.manager.save(compositionsTwo);
      }

      // Save compositionThree (MATERIALS-T -> PRODUCTS)
      if (compositionThree && compositionThree.length > 0) {
        const compositionsThree = compositionThree.map(comp =>
          this.compositionThreeRepository.create({
            strProductId: savedProduct.strId,
            strTransformedMaterialId: comp.componentTransformedMaterialId,
            fltQuantity: comp.quantity,
          })
        );
        await queryRunner.manager.save(compositionsThree);
      }

      // Save images - upload to Cloudinary if Base64
      if (images && images.length > 0) {
        for (const img of images) {
          let imageUrl = img.url;
          
          // Check if image is Base64
          if (imageUrl.startsWith('data:image')) {
            // Convert Base64 to Buffer
            const base64Data = imageUrl.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Upload to Cloudinary
            const result = await this.cloudinaryService.uploadImageFromBuffer(buffer, 'InOut/products');
            imageUrl = result.secure_url;
          }
          
          const image = this.imageRepository.create({
            strTenantId: tenantId,
            strEntityType: 'product',
            strEntityId: savedProduct.strId,
            strImageUrl: imageUrl,
            strStatus: 'active',
          });
          
          await queryRunner.manager.save(image);
        }
      }

      await queryRunner.commitTransaction();
      return savedProduct;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAllProducts(page: number = 1, limit: number = 50) {
    const [products, total] = await this.productRepository.findAndCount({
      take: limit,
      skip: (page - 1) * limit,
    });

    const productsWithImages = await Promise.all(
      products.map(async (product) => {
        const images = await this.imageRepository.find({
          where: {
            strEntityId: product.strId,
            strEntityType: 'product',
            strStatus: 'active'
          }
        });
        return {
          ...product,
          images: images.map(img => ({
            strId: img.strId,
            strImageUrl: img.strImageUrl
          }))
        };
      })
    );

    return {
      data: productsWithImages,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findAll(tenantId: string, page: number = 1, limit: number = 10) {
    const [products, total] = await this.productRepository.findAndCount({
      where: { strTenantId: tenantId },
      take: limit,
      skip: (page - 1) * limit,
    });

    const productsWithImages = await Promise.all(
      products.map(async (product) => {
        const images = await this.imageRepository.find({
          where: {
            strEntityId: product.strId,
            strEntityType: 'product',
            strStatus: 'active'
          }
        });
        return {
          ...product,
          images: images.map(img => ({
            strId: img.strId,
            strImageUrl: img.strImageUrl
          }))
        };
      })
    );

    return {
      data: productsWithImages,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, tenantId: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { strId: id, strTenantId: tenantId },
    });

    if (!product) {
      throw new NotFoundException(`Producto con id '${id}' no encontrado`);
    }

    return product;
  }

  async getComposition(productId: string) {
    return this.compositionRepository.find({
      where: { strProductId: productId },
    });
  }

  async getIngredients(productId: string) {
    const ingredients = [];

    // Obtener materiales simples (composition_two)
    const compositionTwo = await this.compositionTwoRepository.find({
      where: { strProductId: productId },
    });

    for (const comp of compositionTwo) {
      const material = await this.materialRepository.findOne({
        where: { strId: comp.strMaterialId },
      });

      if (material) {
        ingredients.push({
          name: material.strName,
          quantity: parseFloat(comp.fltQuantity.toString()),
          unit: material.strUnitMeasure,
          stock: parseFloat(material.ingQuantity.toString()),
          unitPrice: parseFloat(material.fltPrice.toString()),
          type: 'material',
        });
      }
    }

    // Obtener materiales transformados (composition_three)
    const compositionThree = await this.compositionThreeRepository.find({
      where: { strProductId: productId },
    });

    for (const comp of compositionThree) {
      const transformedMaterial = await this.dataSource
        .getRepository('MaterialT')
        .createQueryBuilder('mt')
        .where('mt.strId = :id', { id: comp.strTransformedMaterialId })
        .getOne();

      if (transformedMaterial) {
        ingredients.push({
          name: transformedMaterial.strName,
          quantity: parseFloat(comp.fltQuantity.toString()),
          unit: transformedMaterial.strUnitMeasure,
          stock: parseFloat(transformedMaterial.ingQuantity.toString()),
          unitPrice: parseFloat(transformedMaterial.fltPrice.toString()),
          type: 'composite',
        });
      }
    }

    return ingredients;
  }

  async createProduction(productionData: any, tenantId: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { productId, date, quantity, batchReference } = productionData;

      // Obtener producto
      const product = await this.productRepository.findOne({
        where: { strId: productId, strTenantId: tenantId },
      });

      if (!product) {
        throw new NotFoundException('Producto no encontrado');
      }

      // Calcular costo unitario basado en ingredientes
      const ingredients = await this.getIngredients(productId);
      let unitCost = 0;
      ingredients.forEach(ing => {
        unitCost += ing.quantity * ing.unitPrice;
      });

      // Registrar producción con el costo de fabricación
      const production = this.productionRepository.create({
        strTenantId: tenantId,
        strProductId: productId,
        dtmDate: date,
        fltQuantity: quantity,
        fltUnitPrice: unitCost,
        strBatchReference: batchReference,
      });
      await queryRunner.manager.save(production);

      // Actualizar stock y costo del producto
      product.ingQuantity = parseFloat(product.ingQuantity.toString()) + parseFloat(quantity);
      product.fltCost = unitCost;
      await queryRunner.manager.save(product);

      // Descontar ingredientes del stock
      const compositionTwo = await this.compositionTwoRepository.find({
        where: { strProductId: productId },
      });

      for (const comp of compositionTwo) {
        const totalNeeded = parseFloat(comp.fltQuantity.toString()) * parseFloat(quantity);
        await queryRunner.manager.query(
          `UPDATE manufacturing.materials SET "ingQuantity" = "ingQuantity" - $1, "dtmUpdateDate" = NOW() WHERE "strId" = $2`,
          [totalNeeded, comp.strMaterialId]
        );
      }

      const compositionThree = await this.compositionThreeRepository.find({
        where: { strProductId: productId },
      });

      for (const comp of compositionThree) {
        const totalNeeded = parseFloat(comp.fltQuantity.toString()) * parseFloat(quantity);
        
        const transformedMaterial = await queryRunner.manager.query(
          `SELECT "fltPrice" FROM manufacturing."materials-t" WHERE "strId" = $1`,
          [comp.strTransformedMaterialId]
        );
        
        await queryRunner.manager.query(
          `UPDATE manufacturing."materials-t" SET "ingQuantity" = "ingQuantity" - $1, "dtmUpdateDate" = NOW() WHERE "strId" = $2`,
          [totalNeeded, comp.strTransformedMaterialId]
        );
        
        await queryRunner.manager.query(
          `INSERT INTO manufacturing.inventory_movements 
           ("strTenantId", "strTransformedMaterialId", "strType", "strReason", "fltQuantity", "fltUnitPrice", "strReferenceId", "strNotes", "dtmDate") 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            tenantId,
            comp.strTransformedMaterialId,
            'OUT',
            'PRODUCTION',
            totalNeeded,
            transformedMaterial[0]?.fltPrice || 0,
            production.strId,
            `Salida para producción: ${product.strName} - Lote: ${batchReference}`,
            date
          ]
        );
      }

      await queryRunner.commitTransaction();
      return { message: 'Producción registrada exitosamente', product };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getProductMovements(productId: string) {
    const productions = await this.productionRepository.find({
      where: { strProductId: productId },
      order: { dtmCreationDate: 'DESC' },
    });

    return productions.map(prod => ({
      dtmDate: prod.dtmDate,
      dtmCreationDate: prod.dtmCreationDate,
      fltQuantity: prod.fltQuantity,
      fltUnitPrice: prod.fltUnitPrice,
      fltPrice: parseFloat(prod.fltQuantity.toString()) * parseFloat(prod.fltUnitPrice.toString()),
      strNotes: prod.strBatchReference ? `Lote: ${prod.strBatchReference}` : 'Producción',
    }));
  }

  async update(id: string, updateDto: any, tenantId: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { compositionTwo, compositionThree, images, categoryId, ...productData } = updateDto;

      const product = await this.productRepository.findOne({
        where: { strId: id, strTenantId: tenantId }
      });

      if (!product) {
        throw new NotFoundException(`Producto con id '${id}' no encontrado`);
      }

      // Update product data
      Object.assign(product, {
        ...productData,
        strName: productData.strName?.toUpperCase() || product.strName,
        intCategoryId: categoryId || product.intCategoryId
      });
      await queryRunner.manager.save(product);

      // Update compositionTwo
      if (compositionTwo) {
        await queryRunner.manager.delete(CompositionTwo, { strProductId: id });
        if (compositionTwo.length > 0) {
          const compositionsTwo = compositionTwo.map((comp: any) =>
            this.compositionTwoRepository.create({
              strProductId: id,
              strMaterialId: comp.componentMaterialId,
              fltQuantity: comp.quantity,
            })
          );
          await queryRunner.manager.save(compositionsTwo);
        }
      }

      // Update compositionThree
      if (compositionThree) {
        await queryRunner.manager.delete(CompositionThree, { strProductId: id });
        if (compositionThree.length > 0) {
          const compositionsThree = compositionThree.map((comp: any) =>
            this.compositionThreeRepository.create({
              strProductId: id,
              strTransformedMaterialId: comp.componentTransformedMaterialId,
              fltQuantity: comp.quantity,
            })
          );
          await queryRunner.manager.save(compositionsThree);
        }
      }

      // Update images
      if (images) {
        await queryRunner.manager.delete(this.imageRepository.target, {
          strEntityId: id,
          strEntityType: 'product'
        });

        for (const img of images) {
          let imageUrl = img.url;
          
          if (imageUrl.startsWith('data:image')) {
            const base64Data = imageUrl.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const result = await this.cloudinaryService.uploadImageFromBuffer(buffer, 'InOut/products');
            imageUrl = result.secure_url;
          }
          
          const image = this.imageRepository.create({
            strTenantId: tenantId,
            strEntityType: 'product',
            strEntityId: id,
            strImageUrl: imageUrl,
            strStatus: 'active',
          });
          
          await queryRunner.manager.save(image);
        }
      }

      await queryRunner.commitTransaction();
      return product;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string, tenantId: string) {
    const product = await this.findOne(id, tenantId);
    await this.productRepository.remove(product);
    return { message: `Producto eliminado exitosamente` };
  }

  private async generateProductCode(tenantId: string): Promise<string> {
    const prefix = await this.getContractPrefix(tenantId);
    
    const lastProduct = await this.productRepository
      .createQueryBuilder('product')
      .where('product.strTenantId = :tenantId', { tenantId })
      .andWhere('product.strCode IS NOT NULL')
      .andWhere('product.strCode LIKE :pattern', { pattern: `${prefix}-P-%` })
      .orderBy('product.strCode', 'DESC')
      .getOne();

    let nextNumber = 1;
    if (lastProduct && lastProduct.strCode) {
      const lastNumber = parseInt(lastProduct.strCode.split('-')[2]);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}-P-${nextNumber.toString().padStart(5, '0')}`;
  }

  private async getContractPrefix(tenantId: string): Promise<string> {
    try {
      const authorizaUrl = process.env.AUTHORIZA_URL || 'http://localhost:3000/api';
      const response = await fetch(`${authorizaUrl}/contracts/tenant/${tenantId}`);
      
      if (response.ok) {
        const contract = await response.json();
        return contract.codePrefix || 'ABC';
      }
    } catch (error) {
      console.error('Error obteniendo prefijo del contrato:', error);
    }
    
    return 'ABC';
  }

  async updateStock(productId: string, quantity: number, tenantId: string) {
    const product = await this.productRepository.findOne({
      where: { strId: productId, strTenantId: tenantId },
    });

    if (!product) {
      return { message: 'Producto no encontrado, stock no actualizado', productId };
    }

    product.ingQuantity = quantity;
    await this.productRepository.save(product);
    
    return { message: 'Stock actualizado exitosamente', product };
  }

  async getCompositionTwo(tenantId: string) {
    return this.compositionTwoRepository.find();
  }

  async getCompositionTwoByProduct(productId: string) {
    return this.compositionTwoRepository.find({
      where: { strProductId: productId }
    });
  }

  async getCompositionThree(tenantId: string) {
    return this.compositionThreeRepository.find();
  }

  async getCompositionThreeByProduct(productId: string) {
    return this.compositionThreeRepository.find({
      where: { strProductId: productId }
    });
  }

  async uploadImages(productId: string, files: Express.Multer.File[], tenantId: string) {
    const product = await this.productRepository.findOne({
      where: { strId: productId, strTenantId: tenantId },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    const uploadedImages = [];
    
    for (const file of files) {
      const result = await this.cloudinaryService.uploadImageFromBuffer(file.buffer, '/InOut/products');
      
      const image = this.imageRepository.create({
        strTenantId: tenantId,
        strEntityType: 'product',
        strEntityId: productId,
        strImageUrl: result.secure_url,
        strStatus: 'active',
      });
      
      const savedImage = await this.imageRepository.save(image);
      uploadedImages.push(savedImage);
    }

    return { message: 'Imágenes subidas exitosamente', images: uploadedImages };
  }
}
