/**
 * Run this script to generate bcrypt hashes for the seed.sql placeholders.
 *   node supabase/hash-passwords.js
 *
 * Copy the output and replace __ADMIN_HASH__, __GC_HASH__, __AGENT_HASH__
 * in supabase/seed.sql before running it.
 */
const bcrypt = require('bcryptjs');

const passwords = {
  __ADMIN_HASH__: 'admin123',
  __GC_HASH__:    'gc123',
  __AGENT_HASH__: 'agent123',
};

console.log('Generating bcrypt hashes (this takes a few seconds)...\n');

Object.entries(passwords).forEach(([placeholder, pw]) => {
  const hash = bcrypt.hashSync(pw, 10);
  console.log(`${placeholder}:`);
  console.log(`  ${hash}\n`);
});

console.log('Replace the __PLACEHOLDER__ values in supabase/seed.sql with the hashes above.');
