import { BadRequestException } from '@nestjs/common';
import { DEFAULT_DELIVERY_OPTIONS, resolveDeliveryOptions, resolveFulfillment, validateDeliveryOptions } from './delivery-options';

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
      expect(resolveFulfillment('DELIVERY', ' Bonanza, casa 4 ', tienda)).toEqual({ fulfillment: 'DELIVERY', deliveryFee: 5000, address: 'Bonanza, casa 4' });
      expect(() => resolveFulfillment('DELIVERY', '', tienda)).toThrow('obligatoria');
      expect(() => resolveFulfillment('DELIVERY', '   ', tienda)).toThrow(BadRequestException);
    });

    it('recoger: sin cargo ni dirección', () => {
      expect(resolveFulfillment('PICKUP', 'algo', tienda)).toEqual({ fulfillment: 'PICKUP', deliveryFee: 0, address: null });
    });

    it('no permite una modalidad que la tienda no ofrece', () => {
      const soloDomicilio = resolveDeliveryOptions({ deliveryFee: 3000 });
      expect(() => resolveFulfillment('PICKUP', '', soloDomicilio)).toThrow('no tiene recogida');
      const soloRecoger = resolveDeliveryOptions({ deliveryEnabled: false, pickupEnabled: true, pickupAddress: 'Calle 1 # 1-1' });
      expect(() => resolveFulfillment('DELIVERY', 'Calle 9 # 9-9', soloRecoger)).toThrow('no hace domicilios');
    });

    it('navegador anterior (sin modalidad): como antes, sin cargo y dirección opcional', () => {
      expect(resolveFulfillment(undefined, '', tienda)).toEqual({ fulfillment: null, deliveryFee: 0, address: null });
      expect(resolveFulfillment(null, 'Calle 3', tienda).address).toBe('Calle 3');
    });

    it('modalidad desconocida → error', () => {
      expect(() => resolveFulfillment('DRONE', 'x', tienda)).toThrow('no válida');
    });
  });
});
