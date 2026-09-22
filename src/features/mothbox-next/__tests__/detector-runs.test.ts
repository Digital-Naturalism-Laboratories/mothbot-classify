import { describe, expect, it } from 'vitest'
import { newestDetectorId, sortDetectorRunsNewestFirst } from '../detector-runs'

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
