import { describe, expect, it } from 'vitest'
import { normalizePathsToRoot, type IndexedPickedFile } from '../files.fs'

function makeEntry(path: string): IndexedPickedFile {
  return {
    path,
    name: path.split('/').filter(Boolean).pop() ?? '',
    size: 0,
  }
}

describe('normalizePathsToRoot', () => {
  it('strips one leading segment when projects root is selected', () => {
    const files = [
      makeEntry('projects-root/project-1/site-1/deployment-1/night-1/patches/a.jpg'),
      makeEntry('projects-root/project-1/site-1/deployment-1/night-1/photo_botdetection.json'),
    ]

    const result = normalizePathsToRoot({ files })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files[0]?.path).toBe('project-1/site-1/deployment-1/night-1/patches/a.jpg')
    expect(result.files[1]?.path).toBe('project-1/site-1/deployment-1/night-1/photo_botdetection.json')
  })

  it('keeps paths unchanged when project root is selected', () => {
    const files = [
      makeEntry('project-1/site-1/deployment-1/night-1/patches/a.jpg'),
      makeEntry('project-1/site-1/deployment-1/night-1/photo_botdetection.json'),
    ]

    const result = normalizePathsToRoot({ files })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files[0]?.path).toBe('project-1/site-1/deployment-1/night-1/patches/a.jpg')
    expect(result.files[1]?.path).toBe('project-1/site-1/deployment-1/night-1/photo_botdetection.json')
  })

  it('returns one level up when deployment folder is selected', () => {
    const files = [makeEntry('deployment-1/night-1/patches/a.jpg')]

    const result = normalizePathsToRoot({ files })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.levelsUp).toBe(1)
  })

  it('returns two levels up when night folder is selected', () => {
    const files = [makeEntry('night-1/patches/a.jpg')]

    const result = normalizePathsToRoot({ files })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.levelsUp).toBe(2)
  })

  it('returns three levels up when patches folder is selected', () => {
    const files = [makeEntry('patches/a.jpg')]

    const result = normalizePathsToRoot({ files })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.levelsUp).toBe(3)
  })

  it('returns files unchanged when no patches jpg exists', () => {
    const files = [makeEntry('project-1/site-1/deployment-1/night-1/photo_botdetection.json')]

    const result = normalizePathsToRoot({ files })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files[0]?.path).toBe('project-1/site-1/deployment-1/night-1/photo_botdetection.json')
  })
})
