/**
 * ADMINISTRATOR ACCOUNTS
 * ======================
 * Works directly against the store rather than over HTTP, because the first
 * administrator cannot be created through an API that requires an
 * administrator to call it.
 *
 *   npm run admin:users hash                       print a hash to paste into the environment
 *   npm run admin:users list
 *   npm run admin:users create rekha@college.in "Rekha Jadhav"
 *   npm run admin:users passwd rekha@college.in
 *   npm run admin:users disable rekha@college.in
 *   npm run admin:users enable  rekha@college.in
 *
 * Passwords are read from the terminal with the echo off, never from an
 * argument: a password on a command line ends up in the shell history and in
 * the process list, where anybody else on the machine can read it.
 *
 * ON A HOST WITH NO SHELL (Cloud Run) use `hash` locally and set
 * ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD_HASH. The first sign-in
 * creates the real record and the variables stop being consulted.
 */
import readline from 'node:readline'
import { Writable } from 'node:stream'
import { flush, getDb, initStore, save } from '../src/db/store.js'
import { hashPassword } from '../src/auth/crypto.js'
import {
  createAdmin, findAdminByEmail, MIN_ADMIN_PASSWORD, passwordProblem, setAdminPassword,
} from '../src/auth/admins.js'

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
}

/** Read a line with the characters hidden, so it stays off the screen. */
function askHidden(prompt: string): Promise<string> {
  let muted = false
  const out = new Writable({
    write(chunk, _enc, done) {
      if (!muted) process.stdout.write(chunk)
      done()
    },
  })

  const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true })
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    muted = true
  })
}

async function askNewPassword(): Promise<string> {
  const first = await askHidden(`New password (at least ${MIN_ADMIN_PASSWORD} characters): `)
  const problem = passwordProblem(first)
  if (problem) {
    console.error(c.red(problem))
    process.exit(1)
  }
  const again = await askHidden('Repeat it: ')
  if (first !== again) {
    console.error(c.red('They do not match.'))
    process.exit(1)
  }
  return first
}

async function main(): Promise<void> {
  const [command, email, ...rest] = process.argv.slice(2)

  // `hash` needs no database at all - it is meant to be run on a laptop and
  // the output pasted into a deployment dashboard.
  if (command === 'hash') {
    const password = await askNewPassword()
    console.log(`\n${c.bold('ADMIN_BOOTSTRAP_PASSWORD_HASH=')}${hashPassword(password)}\n`)
    console.log(c.dim('Set that alongside ADMIN_BOOTSTRAP_EMAIL, sign in once, then remove both.'))
    return
  }

  await initStore()
  const db = getDb()

  switch (command) {
    case 'list': {
      if (db.admins.length === 0) {
        console.log(c.dim('No administrators yet. Create one with `npm run admin:users create <email> "<name>"`.'))
        return
      }
      for (const a of db.admins) {
        const state = a.disabledAt ? c.red('disabled') : c.green('active')
        const seen = a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : 'never'
        console.log(`${c.bold(a.email.padEnd(32))} ${state.padEnd(18)} ${a.name.padEnd(24)} ${c.dim(`last login ${seen}`)}`)
      }
      return
    }

    case 'create': {
      if (!email) throw new Error('Usage: create <email> "<name>"')
      if (findAdminByEmail(db, email)) throw new Error(`${email} already exists`)
      const password = await askNewPassword()
      const admin = createAdmin(db, { email, name: rest.join(' ') || email, password })
      save()
      await flush()
      console.log(c.green(`Created ${admin.email} (${admin.id}).`))
      return
    }

    case 'passwd': {
      const admin = email ? findAdminByEmail(db, email) : undefined
      if (!admin) throw new Error(`No administrator with the address ${email}`)
      const password = await askNewPassword()
      setAdminPassword(admin, password)
      save()
      await flush()
      console.log(c.green(`Password changed for ${admin.email}.`))
      console.log(c.dim('Their existing sessions stay valid - revoke them separately if that matters.'))
      return
    }

    case 'disable':
    case 'enable': {
      const admin = email ? findAdminByEmail(db, email) : undefined
      if (!admin) throw new Error(`No administrator with the address ${email}`)
      // Disabled rather than deleted, so past approvals keep pointing at a name.
      admin.disabledAt = command === 'disable' ? new Date().toISOString() : undefined
      admin.updatedAt = new Date().toISOString()
      save()
      await flush()
      console.log(c.green(`${admin.email} is now ${command === 'disable' ? 'disabled' : 'active'}.`))
      return
    }

    default:
      console.log('Commands: hash | list | create <email> "<name>" | passwd <email> | disable <email> | enable <email>')
  }
}

main().catch((err) => {
  console.error(c.red((err as Error).message))
  process.exit(1)
})
