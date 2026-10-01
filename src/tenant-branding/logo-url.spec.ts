import { logoVariant } from './logo-url';

describe('logoVariant', () => {
  const url = 'https://res.cloudinary.com/demo/image/upload/v123/inout/tenants/t1/branding/abc.webp';

  it('PDF: PNG acotado (pdfmake/jsPDF no leen WebP)', () => {
    expect(logoVariant(url, 'pdf')).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_limit,w_400,h_400,f_png/v123/inout/tenants/t1/branding/abc.webp',
    );
  });

  it('web: formato y calidad automáticos', () => {
    expect(logoVariant(url, 'web')).toContain('/image/upload/c_limit,w_600,h_600,f_auto,q_auto/v123/');
  });

  it('sin logo o URL externa', () => {
    expect(logoVariant(null, 'pdf')).toBeNull();
    expect(logoVariant('https://example.com/logo.png', 'pdf')).toBe('https://example.com/logo.png');
  });
});
