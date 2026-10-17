import { BadRequestException } from '@nestjs/common';
import { DEFAULT_DELIVERY_OPTIONS, OTHER_ZONE, OTHER_ZONE_LABEL, resolveDeliveryOptions, resolveFulfillment, validateDeliveryOptions } from './delivery-options';

describe('delivery-options', () => {
  const tienda = resolveDeliveryOptions({ deliveryEnabled: true, deliveryFee: 5000, pickupEnabled: true, pickupAddress: 'Cra 10 # 20-30, Turbaco' });

  describe('resolveDeliveryOptions', () => {
    it('sin configurar → domicilio sin costo, sin recogida (como hasta ahora)', () => {
      expect(resolveDeliveryOptions(null)).toEqual(DEFAULT_DELIVERY_OPTIONS);
    });

    it('redondea y limita el valor; textos recortados', () => {
      const r = resolveDeliveryOptions({ deliveryFee: 4999.6, pickupAddress: '  Cra 10   # 20-30 ' });
      expect(r.deliveryFee).toBe(5000);
      expect(r.pickupAddress).toBe('Cra 10 # 20-30');
      expect(resolveDeliveryOptions({ deliveryFee: -10 }).deliveryFee).toBe(0);
      expect(resolveDeliveryOptions({ deliveryFee: 'abc' }).deliveryFee).toBe(0);
    });
  });

  describe('validateDeliveryOptions', () => {
    it('exige al menos una modalidad', () => {
      expect(() => validateDeliveryOptions({ deliveryEnabled: false, pickupEnabled: false })).toThrow(BadRequestException);
    });

    it('recoger exige la dirección del local', () => {
      expect(() => validateDeliveryOptions({ pickupEnabled: true, pickupAddress: '' })).toThrow('dirección del local');
    });

    it('rechaza valores negativos o absurdos', () => {
      expect(() => validateDeliveryOptions({ deliveryFee: -1 })).toThrow(BadRequestException);
      expect(() => validateDeliveryOptions({ deliveryFee: 5_000_000 })).toThrow(BadRequestException);
    });

    it('acepta una configuración válida', () => {
      expect(validateDeliveryOptions({ deliveryFee: 6000, pickupEnabled: true, pickupAddress: 'Calle 5 # 2-10' }).deliveryFee).toBe(6000);
    });
  });

  describe('resolveFulfillment', () => {
    it('a domicilio: cobra el valor de la tienda y exige dirección', () => {
      expect(resolveFulfillment('DELIVERY', ' Bonanza, casa 4 ', tienda)).toEqual({ fulfillment: 'DELIVERY', deliveryFee: 5000, address: 'Bonanza, casa 4', zone: null });
      expect(() => resolveFulfillment('DELIVERY', '', tienda)).toThrow('obligatoria');
      expect(() => resolveFulfillment('DELIVERY', '   ', tienda)).toThrow(BadRequestException);
    });

    it('recoger: sin cargo ni dirección', () => {
      expect(resolveFulfillment('PICKUP', 'algo', tienda)).toEqual({ fulfillment: 'PICKUP', deliveryFee: 0, address: null, zone: null });
    });

    it('no permite una modalidad que la tienda no ofrece', () => {
      const soloDomicilio = resolveDeliveryOptions({ deliveryFee: 3000 });
      expect(() => resolveFulfillment('PICKUP', '', soloDomicilio)).toThrow('no tiene recogida');
      const soloRecoger = resolveDeliveryOptions({ deliveryEnabled: false, pickupEnabled: true, pickupAddress: 'Calle 1 # 1-1' });
      expect(() => resolveFulfillment('DELIVERY', 'Calle 9 # 9-9', soloRecoger)).toThrow('no hace domicilios');
    });

    it('navegador anterior (sin modalidad): como antes, sin cargo y dirección opcional', () => {
      expect(resolveFulfillment(undefined, '', tienda)).toEqual({ fulfillment: null, deliveryFee: 0, address: null, zone: null });
      expect(resolveFulfillment(null, 'Calle 3', tienda).address).toBe('Calle 3');
    });

    it('modalidad desconocida → error', () => {
      expect(() => resolveFulfillment('DRONE', 'x', tienda)).toThrow('no válida');
    });
  });

  describe('domicilio por zona', () => {
    const zonas = resolveDeliveryOptions({
      deliveryFee: 6000,
      zones: [
        { name: 'Turbaco', fee: 5000 },
        { name: 'Terrazas de Cucumán', fee: 3500 },
        { name: 'Bonanza (cerca)', fee: 1000 },
        { name: 'Bonanza (lejos)', fee: 1500 },
        { name: ' turbaco ', fee: 1 },
        { name: '', fee: 2000 },
      ],
      otherZones: false,
    });

    it('normaliza: sin repetidas (mayúsculas/tildes) ni sin nombre', () => {
      expect(zonas.zones.map((z) => z.name)).toEqual(['Turbaco', 'Terrazas de Cucumán', 'Bonanza (cerca)', 'Bonanza (lejos)']);
      expect(zonas.otherZones).toBe(false);
    });

    it('cobra el valor de la zona elegida (sin importar mayúsculas ni tildes) y la guarda', () => {
      expect(resolveFulfillment('DELIVERY', 'Calle 5 # 2-10', zonas, 'terrazas de cucuman')).toEqual({
        fulfillment: 'DELIVERY', deliveryFee: 3500, address: 'Calle 5 # 2-10', zone: 'Terrazas de Cucumán',
      });
      expect(resolveFulfillment('DELIVERY', 'Mz 3 casa 8', zonas, 'Bonanza (lejos)').deliveryFee).toBe(1500);
    });

    it('exige elegir zona', () => {
      expect(() => resolveFulfillment('DELIVERY', 'Calle 5 # 2-10', zonas)).toThrow('Elige la zona');
    });

    it('otra zona: rechazada si la tienda no la acepta; por el valor general si la acepta', () => {
      expect(() => resolveFulfillment('DELIVERY', 'Calle 5 # 2-10', zonas, OTHER_ZONE)).toThrow('no hace domicilios a esa zona');
      expect(() => resolveFulfillment('DELIVERY', 'Calle 5 # 2-10', zonas, 'Arjona')).toThrow('no hace domicilios a esa zona');
      const abierta = { ...zonas, otherZones: true };
      expect(resolveFulfillment('DELIVERY', 'Calle 5 # 2-10', abierta, OTHER_ZONE)).toEqual({
        fulfillment: 'DELIVERY', deliveryFee: 6000, address: 'Calle 5 # 2-10', zone: OTHER_ZONE_LABEL,
      });
    });

    it('recoger no usa zona', () => {
      const conRecogida = { ...zonas, pickupEnabled: true, pickupAddress: 'Cra 10 # 20-30' };
      expect(resolveFulfillment('PICKUP', '', conRecogida, 'Turbaco').zone).toBeNull();
    });

    it('zonas de la carta (sin precio) → zonas con el valor del domicilio mientras no se guarden', () => {
      const r = resolveDeliveryOptions({ deliveryFee: 4000 }, ['Turbaco', 'Bonanza', 'turbaco']);
      expect(r.zones).toEqual([{ name: 'Turbaco', fee: 4000 }, { name: 'Bonanza', fee: 4000 }]);
      expect(r.otherZones).toBe(true);
      // Ya guardadas (aunque vacías), mandan las de Entrega
      expect(resolveDeliveryOptions({ deliveryFee: 4000, zones: [] }, ['Turbaco']).zones).toEqual([]);
    });

    it('valida al guardar: nombre, repetidas y valor', () => {
      expect(() => validateDeliveryOptions({ zones: [{ name: '', fee: 1000 }] })).toThrow('necesita un nombre');
      expect(() => validateDeliveryOptions({ zones: [{ name: 'Turbaco', fee: 1 }, { name: 'TURBACO', fee: 2 }] })).toThrow('repetida');
      expect(() => validateDeliveryOptions({ zones: [{ name: 'Turbaco', fee: -5 }] })).toThrow('entre $0');
      expect(() => validateDeliveryOptions({ zones: [{ name: 'Turbaco' }] })).toThrow('entre $0');
      expect(validateDeliveryOptions({ zones: [{ name: 'Turbaco', fee: 5000 }] }).zones).toEqual([{ name: 'Turbaco', fee: 5000 }]);
    });
  });
});
