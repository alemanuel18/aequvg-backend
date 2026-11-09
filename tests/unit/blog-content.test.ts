import { describe, expect, it } from 'vitest'
import { sanitizeBlogContent } from '../../src/modules/blog/services/blog.service'

describe('sanitizeBlogContent', () => {
  it('preserves supported text formatting and text alignment', () => {
    expect(sanitizeBlogContent('<h2>ACS</h2><p style="text-align: center" onclick="evil()"><strong>Química</strong> <em>en acción</em></p>'))
      .toBe('<h2>ACS</h2><p style="text-align: center"><strong>Química</strong> <em>en acción</em></p>')
  })

  it('removes scripts, event handlers and unsafe styles', () => {
    expect(sanitizeBlogContent('<script>alert(1)</script><p style="background:url(javascript:alert(1))" onmouseover="evil()">Texto <img src="x" onerror="evil()"></p>'))
      .toBe('<p>Texto </p>')
  })

  it('retains only image ids and safe alternative text', () => {
    expect(sanitizeBlogContent('<img data-image-id="12" src="javascript:alert(1)" onerror="evil()" alt="Portada ACS"><img data-image-id="0" alt="inválida">'))
      .toBe('<img data-image-id="12" alt="Portada ACS">')
  })

  it('escapes malformed markup left as text', () => {
    expect(sanitizeBlogContent('Texto < sin etiqueta'))
      .toBe('Texto &lt; sin etiqueta')
  })
})
