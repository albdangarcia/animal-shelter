#!/bin/sh
set -e

npx prisma db push

# Seed only when the database is empty, so a restart against the named
# volume never wipes what the user did in the app. Treat "table does not
# exist" (a genuinely fresh database, before `prisma db push` created it —
# though the push above should have already) as empty too, rather than
# failing the container over it.
ANIMAL_COUNT=$(node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
client
  .connect()
  .then(() => client.query('SELECT COUNT(*)::int AS count FROM animals'))
  .then((result) => {
    console.log(result.rows[0].count);
    return client.end();
  })
  .catch(() => {
    console.log(0);
    return client.end().catch(() => {});
  });
")

if [ "$ANIMAL_COUNT" -eq 0 ]; then
  echo "Database is empty (0 animals) — seeding..."
  npx prisma db seed
else
  echo "Database already has $ANIMAL_COUNT animal(s) — skipping seed."
fi

exec npm run dev
