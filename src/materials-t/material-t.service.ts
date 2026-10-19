import {
    BadRequestException,
    HttpException,
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
  import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
  import { InjectRepository } from '@nestjs/typeorm';
  import { DataSource, Repository } from 'typeorm';
  import { PaginationDto } from 'src/common/dtos/pagination.dto';
  import { validate as isUUID } from 'uuid';
  import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
  import { LimitEnforcementService } from 'src/usage-counters/limit-enforcement.service';
  import { areUnitsCompatible, convertUnits, packSizeFor, unitMismatchMessage } from 'src/common/utils/unit-conversion';
  import { assertResaleConfig } from '../common/resale';
  import { ProduceMaterialTDto } from './dto/create-material-t.dto';
  import { ComponentNeed, RecipeComponent, componentNeeds, recipeUnitCost, shortages, validYield, weightedCost } from './composite-recipe';
  
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

      @InjectRepository(InventoryMovement)
      private readonly inventoryMovementRepository: Repository<InventoryMovement>,
  
      private readonly dataSource: DataSource,
  
      private readonly cloudinaryService: CloudinaryService,

      private readonly limitEnforcementService: LimitEnforcementService,
    ) {}
  
    async create(createMaterialDto: CreateMaterialTDto, tenantId: string) {
      const anyDto = createMaterialDto as any;
      anyDto.intPackSize = packSizeFor(anyDto.strUnitMeasure, anyDto.strDischargeUnit, anyDto.intPackSize);
      if (!areUnitsCompatible(anyDto.strUnitMeasure, anyDto.strDischargeUnit, anyDto.intPackSize)) {
        throw new BadRequestException(unitMismatchMessage(anyDto.strUnitMeasure, anyDto.strDischargeUnit));
      }
      assertResaleConfig(anyDto);

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // 1. Generar código autoincremental
        const code = await this.generateMaterialTCode(tenantId);

        // 2. Subir imágenes a Cloudinary si existen
        const { images, uploadedFiles, ...materialData } = createMaterialDto as any;
        const imageUrls = [];
        
        // Handle uploaded files first (from multipart/form-data)
        if (uploadedFiles && uploadedFiles.length > 0) {
          for (const file of uploadedFiles) {
            const result = await this.cloudinaryService.uploadImage(file, '/InOut/materials-t/', tenantId);
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
              const result = await this.cloudinaryService.uploadImageFromBuffer(buffer, '/InOut/materials-t/', tenantId);
              imageUrls.push(result.secure_url);
            }
            // Handle file objects (from FormData)
            else if (imageData.file && Object.keys(imageData.file).length > 0) {
              // If file object has buffer data
              if (imageData.file.buffer) {
                const result = await this.cloudinaryService.uploadImageFromBuffer(imageData.file.buffer, '/InOut/materials-t/', tenantId);
                imageUrls.push(result.secure_url);
              }
              // If file object has path
              else if (imageData.file.path) {
                const result = await this.cloudinaryService.uploadImage(imageData.file, '/InOut/materials-t/', tenantId);
                imageUrls.push(result.secure_url);
              }
            }
          }
        }

        // Receta con rendimiento: ingQuantity es lo que se produce ahora y la
        // receta se escala a esa cantidad. Sin rendimiento (clientes anteriores)
        // se mantiene el comportamiento previo: la receta es lo consumido.
        const recipeYield = validYield(materialData.fltRecipeYield);
        let needs: ComponentNeed[] | null = null;
        if (recipeYield) {
          if (!(materialData.composition || []).length) throw new BadRequestException('La receta necesita al menos un material.');
          const produced = Math.max(0, Number(materialData.ingQuantity) || 0);
          const components = await this.loadRecipeComponents(queryRunner.manager, materialData.composition || [], tenantId, true);
          needs = componentNeeds(components, recipeYield, produced);
          this.assertStock(needs);
          materialData.fltRecipeYield = recipeYield;
          materialData.ingQuantity = produced;
          materialData.fltPrice = recipeUnitCost(components, recipeYield);
        } else {
          delete materialData.fltRecipeYield;
        }

        const material = this.materialRepository.create({
          ...materialData,
          strCode: code,
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
        if (needs && materialData.composition?.length) {
          await queryRunner.manager.save(materialData.composition.map(comp =>
            this.compositionRepository.create({
              strMaterialTId: savedMaterial.strId,
              strComponentMaterialId: comp.componentMaterialId,
              fltQuantity: Number(comp.quantity),
            })
          ));
          if (Number(savedMaterial.ingQuantity) > 0) {
            await this.registerProduction(queryRunner.manager, savedMaterial, needs, Number(savedMaterial.ingQuantity), Number(savedMaterial.fltPrice), tenantId);
          }
        } else if (materialData.composition && materialData.composition.length > 0) {
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
            const componentMaterial = await queryRunner.manager.findOne(Material, { where: { strId: comp.componentMaterialId } });

            // comp.quantity viene en la unidad de DESCARGA del material (la
            // que se usa al armar la receta); el stock (ingQuantity) vive en
            // su unidad de MEDIDA (la de compra). Se convierte antes de
            // descontar para que "15 g" no le reste 15 kg a un material que
            // se compra en kilos.
            const dischargeUnit = componentMaterial?.strDischargeUnit || componentMaterial?.strUnitMeasure;
            const quantityInStockUnit = convertUnits(comp.quantity, dischargeUnit, componentMaterial?.strUnitMeasure, componentMaterial?.intPackSize);

            await queryRunner.manager.query(
              `UPDATE manufacturing.materials SET "ingQuantity" = "ingQuantity" - $1, "dtmUpdateDate" = NOW() WHERE "strId" = $2`,
              [quantityInStockUnit, comp.componentMaterialId]
            );

            // Register inventory movement (OUT)
            const inventoryMovement = this.inventoryMovementRepository.create({
              strTenantId: tenantId,
              strMaterialId: comp.componentMaterialId,
              strType: 'OUT',
              strReason: 'TRANSFORMED_MATERIAL',
              fltQuantity: quantityInStockUnit,
              fltUnitPrice: componentMaterial?.fltPrice || 0,
              strReferenceId: savedMaterial.strId,
              strNotes: `Salida para material compuesto: ${savedMaterial.strName}`,
              dtmDate: new Date().toISOString().split('T')[0]
            });
            await queryRunner.manager.save(inventoryMovement);
          }

          // Register inventory movement for transformed material (IN)
          const entryMovement = this.inventoryMovementRepository.create({
            strTenantId: tenantId,
            strTransformedMaterialId: savedMaterial.strId,
            strType: 'IN',
            strReason: 'PRODUCTION',
            fltQuantity: savedMaterial.ingQuantity,
            fltUnitPrice: savedMaterial.fltPrice,
            strReferenceId: savedMaterial.strId,
            strNotes: `Entrada por producción de material compuesto: ${savedMaterial.strName}`,
            dtmDate: new Date().toISOString().split('T')[0]
          });
          await queryRunner.manager.save(entryMovement);
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
        order: {
          dtmUpdateDate: 'DESC',
          dtmCreationDate: 'DESC'
        },
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
  
    async findOne(term: string) {
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
      };
    }
  
    async update(id: string, updateMaterialDto: UpdateMaterialTDto) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
  
      try {
        const { composition, images, ...materialData } = updateMaterialDto as any;
        // Receta con rendimiento: editarla no produce ni descuenta nada (eso va
        // por POST :id/produce). El stock y el costo los mueven la producción y
        // el kardex, no este formulario.
        const recipeMode = materialData.fltRecipeYield !== undefined;
        if (recipeMode) {
          const y = validYield(materialData.fltRecipeYield);
          if (!y) throw new BadRequestException('Indica cuánto rinde la receta (mayor que 0).');
          materialData.fltRecipeYield = y;
          delete materialData.ingQuantity;
          delete materialData.fltPrice;
        }
  
        let material = await this.materialRepository.preload({
          strId: id,
          ...materialData,
          strName: materialData.strName ? materialData.strName.toUpperCase() : undefined,
        });
  
        if (!material) {
          throw new NotFoundException(`Material con id '${id}' no encontrado`);
        }

        material.intPackSize = packSizeFor(material.strUnitMeasure, material.strDischargeUnit, material.intPackSize);
        if (!areUnitsCompatible(material.strUnitMeasure, material.strDischargeUnit, material.intPackSize)) {
          throw new BadRequestException(unitMismatchMessage(material.strUnitMeasure, material.strDischargeUnit));
        }
        assertResaleConfig(material);

        material = await queryRunner.manager.save(material);

        // Handle images if provided
        if (images && images.length > 0) {
          const imageUrls = [];
          for (const imageData of images) {
            if (imageData.url && imageData.url.startsWith('data:')) {
              // New image - upload to Cloudinary
              const base64Data = imageData.url.split(',')[1];
              const buffer = Buffer.from(base64Data, 'base64');
              const result = await this.cloudinaryService.uploadImageFromBuffer(buffer, '/InOut/materials-t/');
              imageUrls.push(result.secure_url);
            } else if (imageData.url && imageData.url.startsWith('http')) {
              // Existing image - keep as is
              imageUrls.push(imageData.url);
            }
          }

          if (imageUrls.length > 0) {
            // Mark old images as inactive
            await queryRunner.manager.update(
              MaterialImage,
              { strEntityId: id, strEntityType: 'material-t' },
              { strStatus: 'inactive' }
            );

            // Create new image records
            const materialImages = imageUrls.map(url => 
              this.materialImageRepository.create({
                strTenantId: material.strTenantId,
                strEntityType: 'material-t',
                strEntityId: id,
                strImageUrl: url,
                strStatus: 'active'
              })
            );
            await queryRunner.manager.save(materialImages);
          }
        }
  
        if (recipeMode && composition !== undefined) {
          if (!composition?.length) throw new BadRequestException('La receta necesita al menos un material.');
          await queryRunner.manager.delete(CompositionOne, { strMaterialTId: id });
          await queryRunner.manager.save(composition.map(comp =>
            this.compositionRepository.create({
              strMaterialTId: id,
              strComponentMaterialId: comp.componentMaterialId,
              fltQuantity: Number(comp.quantity),
            })
          ));
        }

        // Update compositions if provided (clientes anteriores, sin rendimiento)
        if (!recipeMode && composition !== undefined) {
          // Get old compositions to calculate stock difference
          const oldCompositions = await queryRunner.manager.find(CompositionOne, {
            where: { strMaterialTId: id }
          });

          // Delete old compositions
          await queryRunner.manager.delete(CompositionOne, {
            strMaterialTId: id
          });
  
          // Save new compositions and update stock
          if (composition && composition.length > 0) {
            const compositions = composition.map(comp => 
              this.compositionRepository.create({
                strMaterialTId: id,
                strComponentMaterialId: comp.componentMaterialId,
                fltQuantity: Number(comp.quantity)
              })
            );
            await queryRunner.manager.save(compositions);

            // Update stock: decrement only the additional quantities
            for (const newComp of composition) {
              const oldComp = oldCompositions.find(oc => oc.strComponentMaterialId === newComp.componentMaterialId);
              const oldQty = oldComp ? Number(oldComp.fltQuantity) : 0;
              const newQty = Number(newComp.quantity);
              const additionalQty = newQty - oldQty;

              if (additionalQty > 0) {
                const componentMaterial = await queryRunner.manager.findOne(Material, { where: { strId: newComp.componentMaterialId } });

                // additionalQty está en la unidad de DESCARGA del componente; convertir
                // a su unidad de MEDIDA (la del stock) antes de descontar.
                const dischargeUnit = componentMaterial?.strDischargeUnit || componentMaterial?.strUnitMeasure;
                const additionalQtyInStockUnit = convertUnits(additionalQty, dischargeUnit, componentMaterial?.strUnitMeasure, componentMaterial?.intPackSize);

                await queryRunner.manager.query(
                  `UPDATE manufacturing.materials SET "ingQuantity" = "ingQuantity" - $1, "dtmUpdateDate" = NOW() WHERE "strId" = $2`,
                  [additionalQtyInStockUnit, newComp.componentMaterialId]
                );

                await queryRunner.manager.query(
                  `INSERT INTO manufacturing.inventory_movements
                   ("strTenantId", "strMaterialId", "strType", "strReason", "fltQuantity", "fltUnitPrice", "strReferenceId", "strNotes", "dtmDate")
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                  [
                    material.strTenantId,
                    newComp.componentMaterialId,
                    'OUT',
                    'TRANSFORMED_MATERIAL',
                    additionalQtyInStockUnit,
                    componentMaterial?.fltPrice || 0,
                    id,
                    `Salida adicional para material compuesto: ${material.strName}`,
                    new Date().toISOString().split('T')[0]
                  ]
                );
              }
            }

            // Calculate total additional quantity for transformed material entry
            const totalAdditionalQty = composition.reduce((sum, newComp) => {
              const oldComp = oldCompositions.find(oc => oc.strComponentMaterialId === newComp.componentMaterialId);
              const oldQty = oldComp ? Number(oldComp.fltQuantity) : 0;
              const newQty = Number(newComp.quantity);
              const additionalQty = Math.max(0, newQty - oldQty);
              return sum + additionalQty;
            }, 0);

            // Register entry for transformed material if there's additional quantity
            if (totalAdditionalQty > 0) {
              await queryRunner.manager.query(
                `INSERT INTO manufacturing.inventory_movements 
                 ("strTenantId", "strTransformedMaterialId", "strType", "strReason", "fltQuantity", "fltUnitPrice", "strReferenceId", "strNotes", "dtmDate") 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                  material.strTenantId,
                  id,
                  'IN',
                  'PRODUCTION',
                  totalAdditionalQty,
                  material.fltPrice,
                  id,
                  `Entrada adicional por producción de material compuesto: ${material.strName}`,
                  new Date().toISOString().split('T')[0]
                ]
              );
            }
          }
        }
  
        await queryRunner.commitTransaction();
        return material;
      } catch (error) {
        await queryRunner.rollbackTransaction();
        this.logger.error('Error updating material-t:', error);
        this.handleDBException(error);
      } finally {
        await queryRunner.release();
      }
    }
  
    async remove(id: string) {
      const material = await this.findOne(id);
  
      if (!material) {
        throw new NotFoundException(`Material con id '${id}' no encontrado`);
      }

      const tenantId = (material as any).strTenantId;
      await this.materialRepository.remove(material);
      if (tenantId) {
        await this.limitEnforcementService.decrement(tenantId, 'nMaterialesT');
      }
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

    /** Receta del compuesto con stock y costo de cada componente. */
    async getRecipe(id: string, tenantId: string) {
      const material = await this.materialRepository.findOne({ where: { strId: id, strTenantId: tenantId } });
      if (!material) throw new NotFoundException('Material compuesto no encontrado');
      const lines = await this.compositionRepository.find({ where: { strMaterialTId: id } });
      const components = await this.loadRecipeComponents(
        this.dataSource.manager,
        lines.map((l) => ({ componentMaterialId: l.strComponentMaterialId, quantity: Number(l.fltQuantity) })),
        tenantId,
        false,
      );
      const recipeYield = validYield(material.fltRecipeYield);
      return {
        strId: material.strId,
        strName: material.strName,
        strUnitMeasure: material.strUnitMeasure,
        ingQuantity: Number(material.ingQuantity),
        fltPrice: Number(material.fltPrice),
        fltRecipeYield: recipeYield,
        unitCost: recipeYield ? recipeUnitCost(components, recipeYield) : null,
        components: components.map((c) => ({
          componentMaterialId: c.componentMaterialId,
          name: c.name,
          quantity: c.quantity,
          unit: c.dischargeUnit || c.measureUnit,
          stock: c.stock,
          stockUnit: c.measureUnit,
          unitPrice: c.unitPrice,
          /** Para producir 1 unidad del compuesto, en la unidad del stock. */
          perUnitInStockUnit: recipeYield ? componentNeeds([c], recipeYield, 1)[0].quantityInStockUnit : null,
        })),
      };
    }

    /**
     * Producir más: descuenta la receta escalada a `quantity` (con validación de
     * stock) y suma `quantity` al compuesto con costo promedio ponderado.
     */
    async produce(id: string, dto: ProduceMaterialTDto, tenantId: string) {
      const quantity = Number(dto.quantity);
      if (!(quantity > 0)) throw new BadRequestException('La cantidad a producir debe ser mayor que 0.');
      return this.dataSource.transaction(async (manager) => {
        const rows = await manager.query(
          `SELECT "strId" FROM manufacturing."materials-t" WHERE "strId" = $1 AND "strTenantId" = $2 FOR UPDATE`,
          [id, tenantId],
        );
        if (!rows.length) throw new NotFoundException('Material compuesto no encontrado');
        const material = await manager.findOne(MaterialT, { where: { strId: id } });
        const recipeYield = validYield(material.fltRecipeYield);
        if (!recipeYield) {
          throw new BadRequestException('Esta receta aún no indica cuánto rinde. Edita el material compuesto y complétalo antes de producir.');
        }
        const lines = await manager.find(CompositionOne, { where: { strMaterialTId: id } });
        if (!lines.length) throw new BadRequestException('La receta no tiene materiales.');
        const components = await this.loadRecipeComponents(
          manager,
          lines.map((l) => ({ componentMaterialId: l.strComponentMaterialId, quantity: Number(l.fltQuantity) })),
          tenantId,
          true,
        );
        const needs = componentNeeds(components, recipeYield, quantity);
        this.assertStock(needs);
        const batchUnitCost = recipeUnitCost(components, recipeYield);
        const newCost = weightedCost(Number(material.ingQuantity), Number(material.fltPrice), quantity, batchUnitCost);
        await manager.query(
          `UPDATE manufacturing."materials-t" SET "ingQuantity" = "ingQuantity" + $1, "fltPrice" = $2, "dtmUpdateDate" = NOW() WHERE "strId" = $3`,
          [quantity, newCost, id],
        );
        await this.registerProduction(manager, material, needs, quantity, batchUnitCost, tenantId, dto.date);
        await manager.save(Activity, {
          strTenantId: tenantId,
          strType: 'material_transformed_produced',
          strTitle: `Producción de ${material.strName}: ${quantity} ${material.strUnitMeasure}`,
          strIcon: 'diagram-3',
          strEntityId: id,
        });
        return {
          strId: id,
          produced: quantity,
          ingQuantity: Number(material.ingQuantity) + quantity,
          fltPrice: newCost,
          batchUnitCost,
          consumed: needs.map((n) => ({ componentMaterialId: n.componentMaterialId, name: n.name, quantity: n.quantityInStockUnit, unit: n.measureUnit })),
        };
      });
    }

    /** Componentes de la receta con su unidad, costo y stock (bloqueados si se va a descontar). */
    private async loadRecipeComponents(manager: any, lines: { componentMaterialId: string; quantity: any }[], tenantId: string, lock: boolean): Promise<RecipeComponent[]> {
      const out: RecipeComponent[] = [];
      for (const line of lines) {
        const rows = await manager.query(
          `SELECT "strId", "strName", "ingQuantity", "fltPrice", "strUnitMeasure", "strDischargeUnit", "intPackSize"
             FROM manufacturing.materials WHERE "strId" = $1 AND "strTenantId" = $2${lock ? ' FOR UPDATE' : ''}`,
          [line.componentMaterialId, tenantId],
        );
        const m = rows[0];
        if (!m) throw new BadRequestException('Uno de los materiales de la receta no existe.');
        const quantity = Number(line.quantity);
        if (!(quantity > 0)) throw new BadRequestException(`La cantidad de ${m.strName} en la receta debe ser mayor que 0.`);
        out.push({
          componentMaterialId: m.strId,
          name: m.strName,
          quantity,
          measureUnit: m.strUnitMeasure,
          dischargeUnit: m.strDischargeUnit || m.strUnitMeasure,
          packSize: m.intPackSize,
          unitPrice: Number(m.fltPrice) || 0,
          stock: Number(m.ingQuantity) || 0,
        });
      }
      return out;
    }

    private assertStock(needs: ComponentNeed[]): void {
      const short = shortages(needs);
      if (!short.length) return;
      const list = short.map((n) => `${n.name}: necesitas ${+n.quantityInStockUnit.toFixed(2)} ${n.measureUnit || ''}, hay ${+n.stock.toFixed(2)}`).join('; ');
      throw new BadRequestException(`Stock insuficiente para producir. ${list}`);
    }

    /** Salidas de los componentes y entrada del compuesto en el kardex. */
    private async registerProduction(manager: any, material: MaterialT, needs: ComponentNeed[], quantity: number, batchUnitCost: number, tenantId: string, date?: string) {
      const day = date || new Date().toISOString().split('T')[0];
      for (const n of needs) {
        if (!(n.quantityInStockUnit > 0)) continue;
        await manager.query(
          `UPDATE manufacturing.materials SET "ingQuantity" = "ingQuantity" - $1, "dtmUpdateDate" = NOW() WHERE "strId" = $2`,
          [n.quantityInStockUnit, n.componentMaterialId],
        );
        await manager.save(InventoryMovement, manager.create(InventoryMovement, {
          strTenantId: tenantId,
          strMaterialId: n.componentMaterialId,
          strType: 'OUT',
          strReason: 'TRANSFORMED_MATERIAL',
          fltQuantity: n.quantityInStockUnit,
          fltUnitPrice: n.unitPrice,
          strReferenceId: material.strId,
          strNotes: `Salida para producir ${quantity} ${material.strUnitMeasure} de ${material.strName}`,
          dtmDate: day,
        }));
      }
      await manager.save(InventoryMovement, manager.create(InventoryMovement, {
        strTenantId: tenantId,
        strTransformedMaterialId: material.strId,
        strType: 'IN',
        strReason: 'PRODUCTION',
        fltQuantity: quantity,
        fltUnitPrice: batchUnitCost,
        strReferenceId: material.strId,
        strNotes: `Producción de material compuesto: ${material.strName}`,
        dtmDate: day,
      }));
    }

    async getCompositions(materialTId: string) {
      return await this.compositionRepository.find({
        where: { strMaterialTId: materialTId }
      });
    }
  
    private handleDBException(error: any) {
      // Errores de validación ya tipados (400/404) no deben volverse un 500 genérico
      if (error instanceof HttpException) throw error;
      if (error.code === '23505') throw new BadRequestException(error.detail);
      this.logger.error(error);
      throw new InternalServerErrorException(`Unexpected error, check server logs`);
    }

    private async generateMaterialTCode(tenantId: string): Promise<string> {
      // Obtener el prefijo del contrato del tenant desde Authoriza
      const prefix = await this.getContractPrefix(tenantId);
      
      // Buscar el último material compuesto creado para este tenant
      const lastMaterial = await this.materialRepository
        .createQueryBuilder('material')
        .where('material.strTenantId = :tenantId', { tenantId })
        .andWhere('material.strCode IS NOT NULL')
        .andWhere('material.strCode LIKE :pattern', { pattern: `${prefix}-T-%` })
        .orderBy('material.strCode', 'DESC')
        .getOne();

      let nextNumber = 1;
      if (lastMaterial && lastMaterial.strCode) {
        const lastNumber = parseInt(lastMaterial.strCode.split('-')[2]);
        nextNumber = lastNumber + 1;
      }

      return `${prefix}-T-${nextNumber.toString().padStart(5, '0')}`;
    }

    private async getContractPrefix(tenantId: string): Promise<string> {
      try {
        const authorizaUrl = process.env.AUTHORIZA_API_URL || process.env.AUTHORIZA_URL || 'http://localhost:3000';
        const response = await fetch(`${authorizaUrl}/api/contracts/tenant/${tenantId}`);
        
        if (response.ok) {
          const contract = await response.json();
          const prefix = contract.codePrefix || contract.strCodePrefix || 'ABC';
          return prefix;
        } else {
          console.error('Error en respuesta de Authoriza:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Error obteniendo prefijo del contrato:', error);
      }
      
      return 'ABC';
    }
  }