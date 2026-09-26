/**
 * How long the phone box may be. People type "+91 98220 11223" - fifteen
 * characters - and a box that stopped at ten, or stripped to digits as they
 * typed, cut that to "9198220112", somebody else's number. So the box
 * takes the number as typed, and `isValidPhone` / the server's
 * `normalizePhone` turn it into ten digits. Sixteen leaves room for one more
 * stray space.
 */
export const PHONE_INPUT_MAX = 16
