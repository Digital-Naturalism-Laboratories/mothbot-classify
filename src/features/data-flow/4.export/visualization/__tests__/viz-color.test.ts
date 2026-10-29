import { describe, expect, it } from 'vitest'
import { colorSortKey, emptiestHue, measureInsectColor, sortByColor, type InsectColor } from '../viz-color'

/** A w×h RGBA buffer filled with one color. */
function solid(rgb: [number, number, number], alpha = 255, w = 4, h = 4) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) data.set([...rgb, alpha], i)
  return { data, w, h }
}

function colorOf(rgb: [number, number, number]) {
  const { data, w, h } = solid(rgb)
  return measureInsectColor(data, w, h)!
}

describe('measureInsectColor', () => {
  it('reads hue for chromatic colors', () => {
    const red = colorOf([200, 30, 30])
    const green = colorOf([40, 160, 60])
    const blue = colorOf([40, 60, 200])
    expect(red.h).toBeGreaterThan(15)
    expect(red.h).toBeLessThan(40)
    expect(green.h).toBeGreaterThan(120)
    expect(green.h).toBeLessThan(160)
    expect(blue.h).toBeGreaterThan(250)
    expect(blue.h).toBeLessThan(275)
  })

  it('gives grey near-zero chroma', () => {
    expect(colorOf([128, 128, 128]).c).toBeLessThan(0.001)
  })

  it('ignores transparent background pixels in a nobg silhouette', () => {
    const w = 4, h = 4
    const { data } = solid([255, 255, 255], 0, w, h) // white, fully transparent
    for (let i = 0; i < 4; i++) data.set([40, 160, 60, 255], i * 4) // a green insect row
    const color = measureInsectColor(data, w, h)!
    expect(color.c).toBeGreaterThan(0.1)
    expect(color.h).toBeGreaterThan(120)
    expect(color.h).toBeLessThan(160)
  })

  it('weights the centre of an opaque jpg patch over its background', () => {
    const w = 9, h = 9
    const { data } = solid([230, 230, 230], 255, w, h) // pale sheet
    for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) data.set([40, 60, 200, 255], (y * w + x) * 4)
    const color = measureInsectColor(data, w, h)!
    expect(color.h).toBeGreaterThan(250)
    expect(color.h).toBeLessThan(275)
  })

  it('returns null when nothing is opaque', () => {
    const { data, w, h } = solid([10, 10, 10], 0)
    expect(measureInsectColor(data, w, h)).toBeNull()
  })
})

describe('sortByColor', () => {
  const swatches: Record<string, [number, number, number]> = {
    blue: [40, 60, 200],
    white: [235, 235, 235],
    yellow: [220, 200, 40],
    red: [200, 30, 30],
    black: [20, 20, 20],
    green: [40, 160, 60],
    brown: [120, 85, 55],
  }
  const colors: Record<string, InsectColor | null> = { unmeasured: null }
  for (const [name, rgb] of Object.entries(swatches)) colors[name] = colorOf(rgb)
  const names = Object.keys(colors)

  it('runs around the color wheel, then greys dark to light, unmeasured last', () => {
    // The widest hue gap here is green → blue, so the wheel starts at blue.
    expect(sortByColor(names, (n) => colors[n]!, false))
      .toEqual(['blue', 'red', 'brown', 'yellow', 'green', 'black', 'white', 'unmeasured'])
  })

  it('reverses the whole order', () => {
    expect(sortByColor(names, (n) => colors[n]!, true))
      .toEqual(['unmeasured', 'white', 'black', 'green', 'yellow', 'brown', 'red', 'blue'])
  })

  it('cuts the wheel in the widest empty stretch of hues', () => {
    const at = (h: number): InsectColor => ({ l: 0.5, c: 0.1, h })
    // A purple-tinted night: everything between 250° and 30°, nothing in the greens.
    const cut = emptiestHue([at(250), at(290), at(330), at(350), at(10), at(30), null, { l: 0.5, c: 0, h: 140 }])
    expect(cut).toBeCloseTo(140)
    expect(sortByColor([at(10), at(290), at(30), at(250)], (c) => c, false).map((c) => c.h)).toEqual([250, 290, 10, 30])
  })

  it('treats brown as a color, not a grey', () => {
    expect(colorSortKey(colors.brown)).toBeLessThan(360)
  })
})
