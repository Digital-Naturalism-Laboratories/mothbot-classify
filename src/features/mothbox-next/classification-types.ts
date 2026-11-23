/**
 * What an identification row says.
 * - `taxon`, `morphospecies`: a claim about what the creature is.
 * - `accept`: the "Agree" action — endorses the identification it points at (`agreed_with`).
 * - `error`: a Non-Target label (the label holds its path, e.g. `NON_TARGET/Error/Blur`).
 * - `withdrawn`: the classifier takes back its earlier identifications of this occurrence.
 */
export type ClassificationType = 'accept' | 'taxon' | 'morphospecies' | 'error' | 'withdrawn'

export type ClassifierType = 'bot' | 'human'
