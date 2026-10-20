// next/font/google only works inside Next's compiler. Under vitest every font
// becomes a plain family name, so modules that set a font (the signature
// styles) can be imported by tests. Aliased in vitest.config.ts.

type FontResult = { className: string; style: { fontFamily: string }; variable: string }

const handler: ProxyHandler<Record<string, unknown>> = {
  get: (_t, name) => () => ({ className: '', style: { fontFamily: String(name).replace(/_/g, ' ') }, variable: '' }) satisfies FontResult,
}

const fonts = new Proxy({}, handler) as Record<string, () => FontResult>
export const { Allura, Caveat, Dancing_Script, Great_Vibes, Homemade_Apple, Mrs_Saint_Delafield, Pinyon_Script, Sacramento } = fonts
