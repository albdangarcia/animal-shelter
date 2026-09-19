-- Lowercases every existing persons.email and users.email so rows written
-- before the email-normalization extension match what it now writes.
--
-- Lowercasing can collide with the unique indexes when case-variant rows
-- already exist. Those are duplicate humans, and merging them is a staff
-- decision, so this refuses to guess: it aborts, listing every colliding
-- group, and changes nothing. Resolve them by hand and re-run.

DO $$
DECLARE
  collisions text;
BEGIN
  SELECT string_agg(line, E'\n' ORDER BY line)
    INTO collisions
    FROM (
      SELECT format('  persons: %s -> ids %s', lower(email), string_agg(id, ', ' ORDER BY id)) AS line
        FROM persons
       WHERE email IS NOT NULL
       GROUP BY lower(email)
      HAVING count(*) > 1
      UNION ALL
      SELECT format('  users: %s -> ids %s', lower(email), string_agg(id, ', ' ORDER BY id)) AS line
        FROM users
       GROUP BY lower(email)
      HAVING count(*) > 1
    ) groups;

  IF collisions IS NOT NULL THEN
    RAISE EXCEPTION E'Cannot lowercase email: case-variant duplicates exist. Merge or correct these first:\n%', collisions;
  END IF;
END
$$;

UPDATE persons SET email = lower(email) WHERE email <> lower(email);

UPDATE users SET email = lower(email) WHERE email <> lower(email);
