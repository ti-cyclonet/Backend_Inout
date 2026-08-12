import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { Customer } from '../customers/entities/customer.entity';
import { BusinessParamsService } from '../config/business-params.service';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake');

@Injectable()
export class InvoicePdfService {
  constructor(
    @InjectRepository(Sale)
    private saleRepository: Repository<Sale>,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    private businessParamsService: BusinessParamsService,
  ) {}

  async generateInvoicePdf(saleId: string, tenantId: string): Promise<Buffer> {
    const sale = await this.saleRepository.findOne({
      where: { strId: saleId, strTenantId: tenantId },
    });

    if (!sale) {
      throw new Error('Venta no encontrada');
    }

    // Get customer data if available
    let customer: Customer | null = null;
    if (sale.strCustomerId) {
      customer = await this.customerRepository.findOne({
        where: { id: sale.strCustomerId },
      });
    }

    // Get business data from Authoriza
    const businessData = await this.getBusinessData(tenantId);

    // Parse items
    const items = this.parseItems(sale);

    // Build PDF
    const docDefinition = this.buildDocDefinition(sale, customer, businessData, items);

    return this.createPdfBuffer(docDefinition);
  }

  private async getBusinessData(tenantId: string): Promise<any> {
    // First try from Authoriza contracts
    let data: any = {
      businessName: 'Mi Negocio',
      nit: '',
      address: '',
      phone: '',
      email: '',
      codePrefix: 'ABC',
    };

    try {
      const authorizaUrl = process.env.AUTHORIZA_API_URL || process.env.AUTHORIZA_URL || 'http://localhost:3000';
      const response = await fetch(`${authorizaUrl}/api/contracts/tenant/${tenantId}`);
      if (response.ok) {
        const contract = await response.json();
        data = {
          businessName: contract.businessName || contract.name || 'Mi Negocio',
          nit: contract.nit || contract.documentNumber || '',
          address: contract.address || '',
          phone: contract.phone || '',
          email: contract.email || '',
          codePrefix: contract.codePrefix || 'ABC',
        };
      }
    } catch (error) {
      console.error('Error obteniendo datos del contrato:', error);
    }

    // Override with configured parameters if available
    try {
      const params = await this.businessParamsService.getParams(tenantId);
      if (params['NEGOCIO_NOMBRE']) data.businessName = params['NEGOCIO_NOMBRE'] as any;
      if (params['NEGOCIO_NIT']) data.nit = params['NEGOCIO_NIT'] as any;
      if (params['NEGOCIO_DIRECCION']) data.address = params['NEGOCIO_DIRECCION'] as any;
      if (params['NEGOCIO_TELEFONO']) data.phone = params['NEGOCIO_TELEFONO'] as any;
      if (params['NEGOCIO_EMAIL']) data.email = params['NEGOCIO_EMAIL'] as any;
    } catch {}

    return data;
  }

  private parseItems(sale: Sale): any[] {
    if (!sale.items) {
      return [{
        product: 'Producto',
        quantity: parseFloat(sale.fltQuantity?.toString() || '0'),
        unitPrice: parseFloat(sale.fltUnitPrice?.toString() || '0'),
        total: parseFloat(sale.fltQuantity?.toString() || '0') * parseFloat(sale.fltUnitPrice?.toString() || '0'),
      }];
    }
    try {
      return typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;
    } catch {
      return [];
    }
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private buildDocDefinition(
    sale: Sale,
    customer: Customer | null,
    business: any,
    items: any[],
  ): TDocumentDefinitions {
    const saleDate = sale.dtmCreationDate
      ? new Date(sale.dtmCreationDate).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('es-CO');

    const subtotal = parseFloat(sale.subtotal?.toString() || '0') ||
      items.reduce((sum, item) => sum + (parseFloat(item.total?.toString() || '0')), 0);
    const tax = parseFloat(sale.tax?.toString() || '0');
    const total = parseFloat(sale.total?.toString() || '0') || subtotal + tax;

    const customerName = customer
      ? (customer.personType === 'J'
        ? customer.businessName
        : [customer.firstName, customer.firstSurname].filter(Boolean).join(' '))
      : (sale.customerName || 'Consumidor Final');

    const customerDoc = customer
      ? `${customer.documentType || 'CC'} ${customer.documentNumber || ''}`
      : '';

    const customerPhone = customer?.phone || customer?.contactPhone || '';
    const customerEmail = customer?.email || customer?.contactEmail || '';

    const itemsTableBody = [
      [
        { text: '#', style: 'tableHeader', alignment: 'center' as const },
        { text: 'Producto', style: 'tableHeader' },
        { text: 'Cant.', style: 'tableHeader', alignment: 'center' as const },
        { text: 'P. Unitario', style: 'tableHeader', alignment: 'right' as const },
        { text: 'Total', style: 'tableHeader', alignment: 'right' as const },
      ],
      ...items.map((item, idx) => [
        { text: (idx + 1).toString(), alignment: 'center' as const },
        { text: item.product || item.productName || 'Producto' },
        { text: (item.quantity || 0).toString(), alignment: 'center' as const },
        { text: this.formatCurrency(parseFloat(item.unitPrice?.toString() || '0')), alignment: 'right' as const },
        { text: this.formatCurrency(parseFloat(item.total?.toString() || '0')), alignment: 'right' as const },
      ]),
    ];

    return {
      pageSize: 'LETTER',
      pageMargins: [40, 40, 40, 60],
      content: [
        // Header - Business info
        {
          columns: [
            {
              width: '*',
              stack: [
                { text: business.businessName, style: 'businessName' },
                { text: business.nit ? `NIT: ${business.nit}` : '', style: 'businessDetail' },
                { text: business.address || '', style: 'businessDetail' },
                { text: [business.phone, business.email].filter(Boolean).join(' | '), style: 'businessDetail' },
              ],
            },
            {
              width: 'auto',
              stack: [
                { text: 'COMPROBANTE DE VENTA', style: 'invoiceTitle' },
                { text: sale.strInvoiceCode || 'N/A', style: 'invoiceNumber' },
                { text: `Fecha: ${saleDate}`, style: 'invoiceDate' },
              ],
              alignment: 'right' as const,
            },
          ],
        },
        // Divider
        { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 535, y2: 5, lineWidth: 2, lineColor: '#0066cc' }] },
        { text: '', margin: [0, 10, 0, 0] },
        // Customer info
        {
          style: 'customerBox',
          table: {
            widths: ['*', '*'],
            body: [
              [
                { text: 'DATOS DEL CLIENTE', colSpan: 2, style: 'sectionHeader' },
                {},
              ],
              [
                { text: `Cliente: ${customerName}`, style: 'customerDetail' },
                { text: customerDoc ? `Documento: ${customerDoc}` : '', style: 'customerDetail' },
              ],
              [
                { text: customerPhone ? `Teléfono: ${customerPhone}` : '', style: 'customerDetail' },
                { text: customerEmail ? `Email: ${customerEmail}` : '', style: 'customerDetail' },
              ],
            ],
          },
          layout: {
            fillColor: (rowIndex: number) => rowIndex === 0 ? '#e7f3ff' : null,
            hLineColor: () => '#dee2e6',
            vLineColor: () => '#dee2e6',
          },
        },
        { text: '', margin: [0, 15, 0, 0] },
        // Items table
        {
          table: {
            headerRows: 1,
            widths: [30, '*', 50, 80, 80],
            body: itemsTableBody,
          },
          layout: {
            fillColor: (rowIndex: number) => rowIndex === 0 ? '#0066cc' : (rowIndex % 2 === 0 ? '#f8f9fa' : null),
            hLineColor: () => '#dee2e6',
            vLineColor: () => '#dee2e6',
          },
        },
        { text: '', margin: [0, 15, 0, 0] },
        // Totals
        {
          columns: [
            { width: '*', text: '' },
            {
              width: 200,
              table: {
                widths: ['*', 'auto'],
                body: [
                  [
                    { text: 'Subtotal:', style: 'totalLabel' },
                    { text: this.formatCurrency(subtotal), style: 'totalValue' },
                  ],
                  [
                    { text: 'Impuestos:', style: 'totalLabel' },
                    { text: this.formatCurrency(tax), style: 'totalValue' },
                  ],
                  [
                    { text: 'TOTAL:', style: 'grandTotalLabel' },
                    { text: this.formatCurrency(total), style: 'grandTotalValue' },
                  ],
                ],
              },
              layout: {
                hLineColor: (i: number, node: any) => i === node.table.body.length - 1 ? '#0066cc' : '#dee2e6',
                vLineWidth: () => 0,
                hLineWidth: (i: number, node: any) => i === node.table.body.length - 1 ? 2 : 0.5,
              },
            },
          ],
        },
        { text: '', margin: [0, 30, 0, 0] },
        // Footer note
        {
          text: 'Este documento es un comprobante interno de venta. No tiene validez fiscal.',
          style: 'footerNote',
        },
        {
          text: `Generado el ${new Date().toLocaleDateString('es-CO')} a las ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`,
          style: 'footerNote',
        },
      ],
      styles: {
        businessName: { fontSize: 16, bold: true, color: '#0066cc' },
        businessDetail: { fontSize: 9, color: '#6c757d', margin: [0, 2, 0, 0] },
        invoiceTitle: { fontSize: 12, bold: true, color: '#333' },
        invoiceNumber: { fontSize: 14, bold: true, color: '#0066cc', margin: [0, 4, 0, 0] },
        invoiceDate: { fontSize: 9, color: '#6c757d', margin: [0, 4, 0, 0] },
        sectionHeader: { fontSize: 10, bold: true, color: '#0066cc', margin: [0, 4, 0, 4] },
        customerDetail: { fontSize: 9, margin: [0, 3, 0, 3] },
        tableHeader: { fontSize: 9, bold: true, color: '#ffffff', margin: [0, 4, 0, 4] },
        totalLabel: { fontSize: 10, alignment: 'right' as const, margin: [0, 4, 8, 4] },
        totalValue: { fontSize: 10, alignment: 'right' as const, margin: [0, 4, 0, 4] },
        grandTotalLabel: { fontSize: 12, bold: true, alignment: 'right' as const, margin: [0, 6, 8, 6] },
        grandTotalValue: { fontSize: 12, bold: true, color: '#0066cc', alignment: 'right' as const, margin: [0, 6, 0, 6] },
        footerNote: { fontSize: 8, color: '#999', alignment: 'center' as const, italics: true, margin: [0, 2, 0, 0] },
      },
    } as TDocumentDefinitions;
  }

  private createPdfBuffer(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    const fonts = {
      Roboto: {
        normal: 'node_modules/pdfmake/build/vfs_fonts.js',
        bold: 'node_modules/pdfmake/build/vfs_fonts.js',
        italics: 'node_modules/pdfmake/build/vfs_fonts.js',
        bolditalics: 'node_modules/pdfmake/build/vfs_fonts.js',
      },
    };

    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      pdfDoc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }
}
