import { normalizeWhatsapp, storeInfoFrom, validateStoreInfo, WELCOME_MAX_LENGTH } from './store-info';

describe('store-info', () => {
  describe('normalizeWhatsapp', () => {
    it('acepta un celular de 10 dígitos con espacios o guiones', () => {
      expect(normalizeWhatsapp('300 120 5337')).toBe('3001205337');
      expect(normalizeWhatsapp('300-120-5337')).toBe('3001205337');
    });

    it('quita el indicativo +57', () => {
      expect(normalizeWhatsapp('+57 300 120 5337')).toBe('3001205337');
      expect(normalizeWhatsapp('573001205337')).toBe('3001205337');
    });

    it('vacío es "sin WhatsApp"', () => {
      expect(normalizeWhatsapp('')).toBe('');
      expect(normalizeWhatsapp(null)).toBe('');
      expect(normalizeWhatsapp('  ')).toBe('');
    });

    it('rechaza fijos, números cortos y largos', () => {
      expect(normalizeWhatsapp('6015551234')).toBeNull();
      expect(normalizeWhatsapp('300120533')).toBeNull();
      expect(normalizeWhatsapp('30012053377')).toBeNull();
    });
  });

  describe('validateStoreInfo', () => {
    it('normaliza y recorta', () => {
      expect(validateStoreInfo({ whatsapp: '+57 300 120 5337', welcomeMessage: '  Hola  ' }))
        .toEqual({ ok: true, value: { whatsapp: '3001205337', welcomeMessage: 'Hola' } });
    });

    it('permite dejar ambos vacíos', () => {
      expect(validateStoreInfo({})).toEqual({ ok: true, value: { whatsapp: '', welcomeMessage: '' } });
    });

    it('rechaza un WhatsApp inválido', () => {
      const r = validateStoreInfo({ whatsapp: '12345' });
      expect(r.ok).toBe(false);
    });

    it('rechaza un mensaje demasiado largo', () => {
      const r = validateStoreInfo({ welcomeMessage: 'x'.repeat(WELCOME_MAX_LENGTH + 1) });
      expect(r.ok).toBe(false);
    });
  });

  it('storeInfoFrom tolera la configuración vacía o un número viejo inválido', () => {
    expect(storeInfoFrom(null)).toEqual({ whatsapp: '', welcomeMessage: '' });
    expect(storeInfoFrom({ whatsapp: 'abc', welcomeMessage: null })).toEqual({ whatsapp: '', welcomeMessage: '' });
  });
});
