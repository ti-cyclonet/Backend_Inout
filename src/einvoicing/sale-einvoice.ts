/**
 * Venta directa de InOut → documento electrónico de la DIAN (lo emite
 * Authoriza a través del proveedor tecnológico). Funciones puras
 * (sale-einvoice.spec.ts).
 */

/** Tipos de documento de los clientes de InOut → códigos de la DIAN. */
const DOC_TYPE_DIAN: Record<string, string> = { CC: '13', CE: '22', PP: '41', PA: '41', TI: '12', NIT: '31' };

export interface EinvoiceBuyer {
  idType: string;
  idNumber: string;
  checkDigit?: number | null;
  name: string;
  email?: string | null;
  address?: string | null;
}

export interface EinvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxCode: 'IVA' | 'INC' | 'EXCLUIDO';
  taxRate: number;
  unitCode?: string;
  code?: string;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Comprador desde el cliente de InOut (null si no tiene documento: consumidor final). */
export function buyerFromCustomer(c: any): EinvoiceBuyer | null {
  if (!c) return null;
  const idType = DOC_TYPE_DIAN[String(c.documentType || '').toUpperCase()];
  const idNumber = String(c.documentNumber || '').replace(/\D/g, '');
  const name = String(c.businessName || [c.firstName, c.secondName, c.firstSurname, c.secondSurname].filter(Boolean).join(' ') || c.contactPerson || '').trim();
  if (!idType || idNumber.length < 5 || !name) return null;
  const email = String(c.contactEmail || c.email || '').trim() || null;
  const dv = c.documentDv !== undefined && c.documentDv !== null && c.documentDv !== '' ? Number(c.documentDv) : null;
  return { idType, idNumber, checkDigit: idType === '31' && Number.isFinite(dv) ? dv : null, name, email, address: c.address || null };
}

/**
 * Factura si el comprador está identificado y tiene correo (se le envía);
 * si no, POS electrónico (consumidor final o sin correo). Las ventas a
 * crédito siempre van como factura.
 */
export function docTypeFor(buyer: EinvoiceBuyer | null, paymentType: string): 'FACTURA' | 'POS' {
  if (paymentType === 'CREDITO') return 'FACTURA';
  return buyer?.email ? 'FACTURA' : 'POS';
}

/**
 * Líneas del documento. En InOut el descuento de la venta se resta DESPUÉS del
 * impuesto (total = subtotal + impuesto − descuento); la DIAN lo exige ANTES.
 * Se reparte entre las líneas como descuento sin impuesto (d / (1 + tarifa))
 * para que el total del documento sea lo que pagó el cliente.
 */
export function linesFromSale(
  sale: { items?: any[] | null; subtotal?: number | string | null; discount?: number | string | null; fltQuantity?: any; fltUnitPrice?: any; strProductId?: string },
  tax: { taxType: 'IVA' | 'INC' | 'NONE'; percent: number },
): EinvoiceLine[] {
  const items: any[] = Array.isArray(sale.items) && sale.items.length
    ? sale.items
    : [{ productName: 'Venta', quantity: sale.fltQuantity, unitPrice: sale.fltUnitPrice, productId: sale.strProductId }];
  const taxCode: EinvoiceLine['taxCode'] = tax.taxType === 'NONE' || !(tax.percent > 0) ? 'EXCLUIDO' : tax.taxType;
  const rate = taxCode === 'EXCLUIDO' ? 0 : Number(tax.percent);
  const lines: EinvoiceLine[] = items
    .filter((i) => Number(i.quantity) > 0)
    .map((i) => ({
      description: String(i.productName || i.product || i.name || 'Producto').slice(0, 300),
      quantity: Number(i.quantity),
      unitPrice: round2(Number(i.unitPrice) || 0),
      taxCode,
      taxRate: rate,
      unitCode: '94',
      code: i.productId ? String(i.productId).slice(0, 50) : undefined,
    }));
  const gross = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const saleDiscount = Number(sale.discount) || 0;
  if (saleDiscount > 0 && gross > 0) {
    const preTax = saleDiscount / (1 + rate / 100);
    let left = round2(preTax);
    lines.forEach((l, idx) => {
      const lineGross = round2(l.quantity * l.unitPrice);
      const d = idx === lines.length - 1 ? left : round2((preTax * lineGross) / gross);
      l.discount = Math.min(lineGross, Math.max(0, d));
      left = round2(left - l.discount);
    });
  }
  return lines;
}
