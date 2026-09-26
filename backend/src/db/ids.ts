/**
 * Id generation, in a leaf module on purpose.
 *
 * `seed.ts` derives customers through `customers.ts`, and `customers.ts` needs
 * to mint address ids. Taking that from `store.ts` would close the loop
 * seed -> customers -> store -> seed, and store builds its initial database by
 * calling `seed()` at module load, so the cycle would bite at boot rather than
 * at build time. Keeping ids here leaves nothing to import back.
 */

/** Short, sortable-ish id. Firestore document ids are set from these. */
export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
}

/**
 * A short id a woman can read down a phone line - SMB4821, not SMBm8k2x9q.
 *
 * Four digits is 9,000 ids, and the birthday bound puts an even chance of a
 * repeat at about 112 of them, so the caller hands in a way to ask whether one
 * is already taken and we draw again. Two orders sharing an id is not a
 * cosmetic clash: every lookup in the API is a find-first, so the second buyer
 * would be handed somebody else's order, and a UTR would settle against the
 * wrong seller. Uniqueness is checked, never assumed.
 *
 * ponytail: 9,000 is the ceiling. Past a few thousand live orders the draws
 * start missing and the long form takes over; widen to five digits then.
 */
export function newShortId(prefix: string, taken: (id: string) => boolean): string {
  for (let i = 0; i < 20; i += 1) {
    const id = `${prefix}${1000 + Math.floor(Math.random() * 9000)}`
    if (!taken(id)) return id
  }
  // Too crowded to draw from. A long id is uglier on a receipt and still hers.
  // Bounded, not `while (taken)`: this runs inside a request, and a checkout
  // that never answers is worse than one that fails and says so.
  for (let i = 0; i < 100; i += 1) {
    const id = newId(prefix)
    if (!taken(id)) return id
  }
  throw new Error(`Could not mint an unused ${prefix} id`)
}
