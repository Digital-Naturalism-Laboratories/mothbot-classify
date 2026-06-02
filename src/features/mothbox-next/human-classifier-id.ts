import { userSessionStore } from '~/stores/ui'

export function currentHumanClassifierId(): string {
  const user = userSessionStore.get()
  const initials = (user?.initials || 'user').trim().toLowerCase()
  return initials || 'user'
}
