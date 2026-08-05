#!/usr/bin/env node
/** Emergency password reset from the server console:
 *    node scripts/reset-password.js admin NewPass@123
 *  The user is asked to set their own password at next login. */
import 'dotenv/config';
import { q } from '../src/db.js';
import { hash } from '../src/auth.js';

const [u, pw] = process.argv.slice(2);
if (!u || !pw) { console.error('Usage: node scripts/reset-password.js <username> <newpassword>'); process.exit(1); }
if (pw.length < 6) { console.error('Password must be at least 6 characters'); process.exit(1); }
const { rowCount } = await q('UPDATE users SET pass_hash=$1, must_change=true, active=true WHERE username=$2',
  [await hash(pw), u.toLowerCase()]);
console.log(rowCount ? `Password reset for "${u}".` : `No user called "${u}".`);
process.exit(0);
