import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, UseInterceptors } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GetTenantId } from '../common/decorators/get-tenant-id.decorator';
import { OrderStatus } from './entities/order.entity';
import { CheckLimit } from '../usage-counters/decorators/check-limit.decorator';
import { LimitEnforcementGuard } from '../usage-counters/guards/limit-enforcement.guard';
import { UsageWarningInterceptor } from '../usage-counters/interceptors/usage-warning.interceptor';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(LimitEnforcementGuard)
  @CheckLimit('nPedidos')
  @UseInterceptors(UsageWarningInterceptor)
  @Roles('admin', 'operator')
  create(@Body() createDto: CreateOrderDto, @GetTenantId() tenantId: string) {
    return this.ordersService.create(createDto, tenantId);
  }

  @Get()
  findAll(@GetTenantId() tenantId: string) {
    return this.ordersService.findAll(tenantId);
  }

  @Get('stats')
  getStats(@GetTenantId() tenantId: string) {
    return this.ordersService.getStats(tenantId);
  }

  @Get('status/:status')
  findByStatus(
    @Param('status') status: OrderStatus,
    @GetTenantId() tenantId: string,
  ) {
    return this.ordersService.findByStatus(tenantId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.ordersService.findOne(id, tenantId);
  }

  @Patch(':id')
  @Roles('admin', 'operator')
  update(
    @Param('id') id: string,
    @Body() updateDto: Partial<CreateOrderDto>,
    @GetTenantId() tenantId: string,
  ) {
    return this.ordersService.update(id, tenantId, updateDto);
  }

  @Patch(':id/status')
  @Roles('admin', 'operator')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateOrderStatusDto,
    @GetTenantId() tenantId: string,
  ) {
    return this.ordersService.updateStatus(id, tenantId, updateStatusDto.status);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string, @GetTenantId() tenantId: string) {
    return this.ordersService.remove(id, tenantId);
  }
}
