import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

/**
 * Builds a FileSystemDirectoryHandleLike that overlays a `_processed` mirror
 * directory on top of a primary source directory. Reads check the mirror
 * first (e.g. `_botdetection.json` / `_identified.json` files that live
 * under `_processed/<night>/...`), then fall back to the primary directory
 * (source images, `patches/` folders, anything not present in the mirror).
 *
 * This lets the existing adapter — which expects JSON files co-located next
 * to source images/patches — work unmodified against the newer layout where
 * JSON output was moved into a directory tree mirrored under `_processed`,
 * sitting as a SIBLING of the dataset folder (not nested inside it):
 *
 *   datasets/
 *     night5_6/        <- primaryHandle (images, patches/)
 *     _processed/
 *       night5_6/      <- mirrorHandle (the *_botdetection.json, *_identified.json files)
 *
 * Writes (createWritable, removeEntry, create:true) always go to the
 * primary handle, never the mirror, since the mirror is processing output
 * we shouldn't be modifying from the classify UI.
 */
export function buildProcessedMirrorOverlayHandle(params: {
  primaryHandle: FileSystemDirectoryHandleLike
  mirrorHandle: FileSystemDirectoryHandleLike
}): FileSystemDirectoryHandleLike {
  const { primaryHandle, mirrorHandle } = params
  return wrapOverlayDir(primaryHandle, mirrorHandle)
}

function wrapOverlayDir(
  primary: FileSystemDirectoryHandleLike,
  mirror: FileSystemDirectoryHandleLike | null,
): FileSystemDirectoryHandleLike {
  return {
    name: primary.name,
    kind: 'directory',

    getFileHandle: async (name, options) => {
      // Mirror takes priority for reads (JSON outputs live there).
      if (mirror?.getFileHandle) {
        try {
          const fh = await mirror.getFileHandle(name)
          if (fh) return fh
        } catch {
          // fall through to primary
        }
      }
      if (!primary.getFileHandle) throw makeNotFoundError(name)
      return primary.getFileHandle(name, options)
    },

    getDirectoryHandle: async (name, options) => {
      let primaryChild: FileSystemDirectoryHandleLike | null = null
      let mirrorChild: FileSystemDirectoryHandleLike | null = null

      try {
        primaryChild = (await primary.getDirectoryHandle?.(name, options)) ?? null
      } catch {
        primaryChild = null
      }

      if (mirror?.getDirectoryHandle) {
        try {
          mirrorChild = (await mirror.getDirectoryHandle(name)) ?? null
        } catch {
          mirrorChild = null
        }
      }

      if (!primaryChild && !mirrorChild) throw makeNotFoundError(name)
      if (!primaryChild) return mirrorChild as FileSystemDirectoryHandleLike
      return wrapOverlayDir(primaryChild, mirrorChild)
    },

    removeEntry: async (name, options) => {
      if (!primary.removeEntry) throw new Error(`Cannot remove: ${name}`)
      return primary.removeEntry(name, options)
    },

    queryPermission: primary.queryPermission?.bind(primary),
    requestPermission: primary.requestPermission?.bind(primary),

    entries: async function* () {
      const seen = new Set<string>()
      if (primary.entries) {
        for await (const [name, handle] of primary.entries()) {
          seen.add(name)
          if (handle.kind === 'directory') {
            let mirrorChild: FileSystemDirectoryHandleLike | null = null
            if (mirror?.getDirectoryHandle) {
              try {
                mirrorChild = (await mirror.getDirectoryHandle(name)) ?? null
              } catch {
                mirrorChild = null
              }
            }
            yield [name, wrapOverlayDir(handle as FileSystemDirectoryHandleLike, mirrorChild)]
          } else {
            yield [name, handle]
          }
        }
      }
      if (mirror?.entries) {
        for await (const [name, handle] of mirror.entries()) {
          if (seen.has(name)) continue
          yield [name, handle]
        }
      }
    },

    values: async function* () {
      const self = wrapOverlayDir(primary, mirror)
      for await (const [, handle] of self.entries!()) yield handle
    },
  }
}

function makeNotFoundError(name: string) {
  const err = new Error(`File not found: ${name}`)
  ;(err as { name?: string }).name = 'NotFoundError'
  return err
}
