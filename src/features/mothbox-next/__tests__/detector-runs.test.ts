import { describe, expect, it } from 'vitest'
import { defaultDetectorId, itemsOfOneRun, newestDetectorId, runByNight, sortDetectorRunsNewestFirst } from '../detector-runs'

describe('detector run ordering', () => {
  it('ranks MBD versions numerically, newest first', () => {
    expect(sortDetectorRunsNewestFirst(['Mothbot_MBD-0-2.pt', 'Mothbot_MBD-1-1.pt', 'Mothbot_MBD-1-0.pt'])).toEqual([
      'Mothbot_MBD-1-1.pt',
      'Mothbot_MBD-1-0.pt',
      'Mothbot_MBD-0-2.pt',
    ])
  })

  it('is numeric, not lexical (MBD-1-10 is newer than MBD-1-9)', () => {
    expect(newestDetectorId(['Mothbot_MBD-1-9.pt', 'Mothbot_MBD-1-10.pt'])).toBe('Mothbot_MBD-1-10.pt')
  })

  it('puts any MBD model ahead of the legacy dated yolo model, despite string order', () => {
    const ids = ['Mothbot_yolo11m_4500_imgsz1600_b1_2024-01-18.pt', 'Mothbot_MBD-0-2.pt']
    expect(newestDetectorId(ids)).toBe('Mothbot_MBD-0-2.pt')
    // sanity: plain string sort would have picked the yolo model
    expect([...ids].sort().at(-1)).toBe('Mothbot_yolo11m_4500_imgsz1600_b1_2024-01-18.pt')
  })

  it('orders legacy dated models by their date', () => {
    expect(
      newestDetectorId(['Mothbot_yolo11m_x_2024-01-18.pt', 'Mothbot_yolo11m_x_2025-03-02.pt']),
    ).toBe('Mothbot_yolo11m_x_2025-03-02.pt')
  })

  it('never defaults to HumanDetection when a bot run exists', () => {
    expect(newestDetectorId(['HumanDetection', 'Mothbot_MBD-0-2.pt'])).toBe('Mothbot_MBD-0-2.pt')
    expect(sortDetectorRunsNewestFirst(['HumanDetection', 'Mothbot_MBD-0-2.pt'])).toEqual([
      'Mothbot_MBD-0-2.pt',
      'HumanDetection',
    ])
  })

  it('falls back to HumanDetection when it is the only run', () => {
    expect(newestDetectorId(['HumanDetection'])).toBe('HumanDetection')
  })

  it('returns undefined for no runs', () => {
    expect(newestDetectorId([])).toBeUndefined()
  })

  it('matches the real bowedBarbo case: MBD-1-1 beats MBD-0-2 and HumanDetection', () => {
    expect(newestDetectorId(['HumanDetection', 'Mothbot_MBD-0-2.pt', 'Mothbot_MBD-1-1.pt'])).toBe('Mothbot_MBD-1-1.pt')
  })
})

describe('itemsOfOneRun', () => {
  const night = [
    { id: 'a', detectorId: 'Mothbot_MBD-1-0.pt' },
    { id: 'b', detectorId: 'Mothbot_MBD-1-1.pt' },
    { id: 'c', detectorId: 'Mothbot_MBD-1-1.pt' },
    { id: 'h', detectorId: 'HumanDetection' },
  ]
  it('keeps the newest bot run by default', () => {
    expect(itemsOfOneRun(night).map((d) => d.id)).toEqual(['b', 'c'])
  })
  it('keeps the preferred run when the night has it, else falls back to the newest', () => {
    expect(itemsOfOneRun(night, 'Mothbot_MBD-1-0.pt').map((d) => d.id)).toEqual(['a'])
    expect(itemsOfOneRun(night, 'Mothbot_MBD-2-0.pt').map((d) => d.id)).toEqual(['b', 'c'])
  })
  it('leaves a single-run night untouched', () => {
    const one = [{ id: 'x', detectorId: 'Mothbot_MBD-1-1.pt' }, { id: 'y' }]
    expect(itemsOfOneRun(one)).toBe(one)
  })
})

describe('defaultDetectorId', () => {
  it("prefers the run Mothbot Process last made for the nights over the newest model name", () => {
    const ids = ['Mothbot_MBD-1-2.pt', 'Mothbot_Anybug-Mixed-v2-0.pt']
    const current = { night1: 'Mothbot_Anybug-Mixed-v2-0.pt', night2: 'Mothbot_Anybug-Mixed-v2-0.pt', night3: 'Mothbot_MBD-1-2.pt' }
    expect(defaultDetectorId(ids, ['night1', 'night2', 'night3'], current)).toBe('Mothbot_Anybug-Mixed-v2-0.pt')
    expect(defaultDetectorId(ids, ['night3'], current)).toBe('Mothbot_MBD-1-2.pt')
  })

  it('falls back to the newest model name when the current run is unknown', () => {
    expect(defaultDetectorId(['Mothbot_MBD-1-0.pt', 'Mothbot_MBD-1-2.pt'], ['night9'], {})).toBe('Mothbot_MBD-1-2.pt')
  })
})

describe('Anybug models and the newest run of each night', () => {
  it('ranks Anybug models above MBD ones', () => {
    expect(
      sortDetectorRunsNewestFirst(['Mothbot_MBD-1-2.pt', 'Mothbot_Anybug-Mixed-v2-0.pt', 'Mothbot_MBD-1-0.pt', 'Mothbot_Anybug-MixedNano-v2-0.pt']).slice(0, 2),
    ).toEqual(['Mothbot_Anybug-MixedNano-v2-0.pt', 'Mothbot_Anybug-Mixed-v2-0.pt'])
  })

  it("picks each night's run: Process's current one, else the newest it has", () => {
    const items = [
      { leafGroupId: 'ditch-13', detectorId: 'Mothbot_MBD-1-0.pt' },
      { leafGroupId: 'ditch-13', detectorId: 'Mothbot_Anybug-Mixed-v2-0.pt' },
      { leafGroupId: 'ditch-14', detectorId: 'Mothbot_MBD-1-0.pt' },
      { leafGroupId: 'ditch-14', detectorId: 'Mothbot_MBD-1-1.pt' },
      { leafGroupId: 'cactus-11', detectorId: 'Mothbot_Anybug-Mixed-v2-0.pt' },
      { leafGroupId: 'cactus-11', detectorId: 'Mothbot_MBD-1-2.pt' },
    ]
    expect(runByNight(items, { 'cactus-11': 'Mothbot_MBD-1-2.pt' })).toEqual({
      'ditch-13': 'Mothbot_Anybug-Mixed-v2-0.pt',
      'ditch-14': 'Mothbot_MBD-1-1.pt',
      'cactus-11': 'Mothbot_MBD-1-2.pt',
    })
  })
})
