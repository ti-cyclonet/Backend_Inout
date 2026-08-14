import { Controller, Post, Body } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateMarketplaceOrderDto } from './dto/create-marketplace-order.dto';

@Controller('orders')
export class OrdersMarketplaceController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('marketplace')
  createFromMarketplace(@Body() createDto: CreateMarketplaceOrderDto) {
    return this.ordersService.createFromMarketplace(createDto);
  }
}
