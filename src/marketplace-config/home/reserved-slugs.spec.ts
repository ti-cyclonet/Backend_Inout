import { isReservedSlug } from './reserved-slugs';

describe('slugs reservados', () => {
  it('home no puede ser el slug de una tienda', () => {
    expect(isReservedSlug('home')).toBe(true);
    expect(isReservedSlug(' Home ')).toBe(true);
    expect(isReservedSlug('cyclonetsas')).toBe(false);
    expect(isReservedSlug(null)).toBe(false);
  });
});
