#!/usr/bin/env node
// User management for the Music UI login (PLAN.md §9). Runs inside the container:
//   docker exec -it music-ui node cli.mjs user add alice
// Uses Node built-ins only and the app database in DATA_DIR (the app must have started once).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { Writable } from 'node:stream';
import { USERNAME_PATTERN, hashPassword } from './password.mjs';

const USAGE = `Usage: node cli.mjs <command>

  user add <name>         Create a user (asks for the password)
  user passwd <name>      Change a password (signs the user out everywhere)
  user remove <name>      Delete a user and their sessions
  user list               List the users
  sessions clear [name]   Sign everyone (or one user) out

The password is read from the terminal, or from standard input when it is not one
(e.g. echo "secret" | docker exec -i music-ui node cli.mjs user add alice).
Database: $DATA_DIR/music-ui.db (DATA_DIR defaults to ./data).`;

const SCHEMA_VERSION = 2;
const MIN_PASSWORD_LENGTH = 8;

class CliError extends Error {}

function openDatabase() {
  const path = join(process.env.DATA_DIR || './data', 'music-ui.db');
  if (!existsSync(path)) {
    throw new CliError(`No database at ${path}. Start the app once (it creates it), then retry.`);
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  if (version < SCHEMA_VERSION) {
    throw new CliError(
      'The database predates user accounts. Start the new app version once first.',
    );
  }
  return db;
}

/** Reads answers from the terminal (hidden) or, when piped, from the lines of stdin. */
function createPrompter() {
  if (process.stdin.isTTY) {
    return {
      async ask(question) {
        process.stdout.write(question);
        const muted = new Writable({ write: (_chunk, _encoding, done) => done() });
        const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
        const answer = await new Promise((resolve) => rl.question('', resolve));
        rl.close();
        process.stdout.write('\n');
        return answer;
      },
      close() {},
    };
  }
  const rl = createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  return {
    async ask() {
      const { value, done } = await lines.next();
      return done ? '' : value;
    },
    close: () => rl.close(),
  };
}

async function readNewPassword() {
  const prompter = createPrompter();
  try {
    const password = await prompter.ask('Password: ');
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new CliError(`The password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (process.stdin.isTTY && (await prompter.ask('Repeat the password: ')) !== password) {
      throw new CliError('The passwords do not match.');
    }
    return password;
  } finally {
    prompter.close();
  }
}

function requireName(name) {
  if (!name) throw new CliError(USAGE);
  if (!USERNAME_PATTERN.test(name)) {
    throw new CliError('A username has 1 to 64 letters, digits or the characters _ . @ -');
  }
  return name;
}

function findUser(db, name) {
  return db.prepare('SELECT username FROM users WHERE username = ?').get(name)?.username;
}

function requireUser(db, name) {
  const username = findUser(db, requireName(name));
  if (!username) throw new CliError(`No user named "${name}".`);
  return username;
}

async function run([group, command, name]) {
  const action = `${group ?? ''} ${command ?? ''}`.trim();
  if (!group || group === 'help' || group === '--help' || group === '-h') {
    console.log(USAGE);
    return;
  }
  const db = openDatabase();
  try {
    switch (action) {
      case 'user add': {
        const username = requireName(name);
        if (findUser(db, username)) throw new CliError(`"${username}" already exists.`);
        const hash = await hashPassword(await readNewPassword());
        db.prepare('INSERT INTO users (username, passwordHash, created) VALUES (?, ?, ?)').run(
          username,
          hash,
          new Date().toISOString(),
        );
        console.log(`Created "${username}".`);
        return;
      }
      case 'user passwd': {
        const username = requireUser(db, name);
        const hash = await hashPassword(await readNewPassword());
        db.prepare('UPDATE users SET passwordHash = ? WHERE username = ?').run(hash, username);
        db.prepare('DELETE FROM sessions WHERE username = ?').run(username);
        console.log(`Changed the password of "${username}" and signed them out.`);
        return;
      }
      case 'user remove': {
        const username = requireUser(db, name);
        db.prepare('DELETE FROM users WHERE username = ?').run(username);
        console.log(`Removed "${username}".`);
        return;
      }
      case 'user list': {
        const now = new Date().toISOString();
        const users = db
          .prepare(
            `SELECT u.username, u.created,
                    (SELECT COUNT(*) FROM sessions s WHERE s.username = u.username AND s.expires > ?)
                      AS sessions
             FROM users u ORDER BY u.username`,
          )
          .all(now);
        if (users.length === 0) console.log('No users yet. Create one with: user add <name>');
        for (const user of users) {
          console.log(`${user.username}\tcreated ${user.created}\t${user.sessions} session(s)`);
        }
        return;
      }
      case 'sessions clear': {
        const { changes } = name
          ? db.prepare('DELETE FROM sessions WHERE username = ?').run(requireUser(db, name))
          : db.prepare('DELETE FROM sessions').run();
        console.log(`Removed ${changes} session(s).`);
        return;
      }
      default:
        throw new CliError(USAGE);
    }
  } finally {
    db.close();
  }
}

try {
  await run(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof CliError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
