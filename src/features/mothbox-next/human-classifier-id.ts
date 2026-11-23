import { userSessionStore } from '~/stores/ui'

/** The current person's classifier id: their typed name, trimmed and lower-cased (names their file). */
export function currentHumanClassifierId(): string {
  const user = userSessionStore.get()
  const initials = (user?.initials || 'user').trim().toLowerCase()
  return initials || 'user'
}

/** The current person's name exactly as they typed it: a full name or initials (ontology: `identifierName`). */
export function currentHumanIdentifierName(): string | undefined {
  return userSessionStore.get()?.initials?.trim() || undefined
}
