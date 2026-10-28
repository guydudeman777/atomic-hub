/**
 * Table codes: six characters to read out or type, with no letters that
 * look like numbers. A code names a room for one game, and an invite link
 * opens that game's lobby ready to join it.
 */

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const CODE_LENGTH = 6

export function newCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[Math.floor(random() * ALPHABET.length)]
  return code
}

/** Tidy what someone typed or pasted: case, spaces and dashes. Null if it can't be a code. */
export function cleanCode(typed: string): string | null {
  const code = typed.toUpperCase().replace(/[\s-]/g, '')
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : null
}

/** Show a code in two halves: K7Q-X2M. */
export const spaced = (code: string): string => `${code.slice(0, 3)}-${code.slice(3)}`

/** The link that opens `game`'s lobby and joins the table. Hash routes work from any Pages path. */
export function inviteLink(game: string, code: string): string {
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}#/${game}/join/${code}`
}

/** The code in a `/<game>/join/<code>` path, if it's one. */
export function codeFromPath(path: string, game: string): string | null {
  const match = path.match(new RegExp(`^/${game}/join/([^/]+)$`))
  return match ? cleanCode(decodeURIComponent(match[1])) : null
}
