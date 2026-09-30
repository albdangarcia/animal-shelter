import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutId,
  resolveHarnessCoordinates,
} from "./test-harness-coordinates";

const mainCheckout = {
  root: "/work/animal-shelter",
  isLinkedWorktree: false,
  env: {},
};

const defaultPostgres = {
  user: "postgres",
  password: "mysecretpassword",
  database: "postgres",
};

const url = (port: string) =>
  `postgresql://postgres:mysecretpassword@127.0.0.1:${port}/postgres`;

const worktree = {
  root: "/work/animal-shelter/.claude/worktrees/brave-otter",
  isLinkedWorktree: true,
  env: {},
};

test("the main checkout keeps the original e2e project and Postgres port", () => {
  assert.deepEqual(resolveHarnessCoordinates(mainCheckout), {
    slot: 0,
    slotSource: "main checkout",
    postgres: defaultPostgres,
    e2e: {
      projectName: "animal-shelter-playwright",
      postgresPort: "55432",
      appPort: "3100",
      databaseUrl: url("55432"),
    },
    testDb: {
      projectName: "animal-shelter-db-tests",
      postgresPort: "55600",
      databaseUrl: url("55600"),
    },
  });
});

test("a worktree's slot and project names come from the hash of its path", () => {
  // sha256(path) starts b42edc82; 1 + (0xb42edc82 % 99) = 37.
  assert.deepEqual(resolveHarnessCoordinates(worktree), {
    slot: 37,
    slotSource: "worktree path",
    postgres: defaultPostgres,
    e2e: {
      projectName: "animal-shelter-playwright-b42edc82",
      postgresPort: "55537",
      appPort: "3137",
      databaseUrl: url("55537"),
    },
    testDb: {
      projectName: "animal-shelter-db-tests-b42edc82",
      postgresPort: "55637",
      databaseUrl: url("55637"),
    },
  });
});

test("two worktrees on the same slot share ports but not project names", () => {
  // So the second one fails on a busy port instead of reusing the first
  // one's container.
  const first = resolveHarnessCoordinates(worktree);
  const second = resolveHarnessCoordinates({
    ...worktree,
    root: "/work/animal-shelter/.claude/worktrees/wt-198",
  });

  assert.equal(second.slot, first.slot);
  assert.equal(second.e2e.postgresPort, first.e2e.postgresPort);
  assert.equal(second.testDb.postgresPort, first.testDb.postgresPort);
  assert.notEqual(second.e2e.projectName, first.e2e.projectName);
  assert.notEqual(second.testDb.projectName, first.testDb.projectName);
});

test("the same path always gives the same coordinates", () => {
  assert.deepEqual(
    resolveHarnessCoordinates(worktree),
    resolveHarnessCoordinates({ ...worktree }),
  );
});

test("different worktree paths get different project names", () => {
  const other = resolveHarnessCoordinates({
    ...worktree,
    root: "/work/animal-shelter/.claude/worktrees/calm-heron",
  });
  assert.notEqual(
    other.e2e.projectName,
    resolveHarnessCoordinates(worktree).e2e.projectName,
  );
});

test("E2E_SLOT=0 gives a worktree the main checkout's ports but its own project names", () => {
  assert.deepEqual(
    resolveHarnessCoordinates({ ...worktree, env: { E2E_SLOT: "0" } }),
    {
      slot: 0,
      slotSource: "E2E_SLOT",
      postgres: defaultPostgres,
      e2e: {
        projectName: "animal-shelter-playwright-b42edc82",
        postgresPort: "55432",
        appPort: "3100",
        databaseUrl: url("55432"),
      },
      testDb: {
        projectName: "animal-shelter-db-tests-b42edc82",
        postgresPort: "55600",
        databaseUrl: url("55600"),
      },
    },
  );
});

test("E2E_SLOT=0 in the main checkout keeps the bare project names", () => {
  const { slotSource, ...coordinates } = resolveHarnessCoordinates({
    ...mainCheckout,
    env: { E2E_SLOT: "0" },
  });
  const { slotSource: _default, ...defaults } =
    resolveHarnessCoordinates(mainCheckout);

  assert.equal(slotSource, "E2E_SLOT");
  assert.deepEqual(coordinates, defaults);
});

test("E2E_SLOT picks the ports and keeps the path hash in the project names", () => {
  const coordinates = resolveHarnessCoordinates({
    ...worktree,
    env: { E2E_SLOT: "7" },
  });
  const id = checkoutId(worktree.root);

  assert.equal(coordinates.slot, 7);
  assert.equal(coordinates.e2e.projectName, `animal-shelter-playwright-${id}`);
  assert.equal(coordinates.e2e.postgresPort, "55507");
  assert.equal(coordinates.e2e.appPort, "3107");
  assert.equal(coordinates.testDb.projectName, `animal-shelter-db-tests-${id}`);
  assert.equal(coordinates.testDb.postgresPort, "55607");
});

test("an empty E2E_SLOT is ignored", () => {
  assert.equal(
    resolveHarnessCoordinates({ ...worktree, env: { E2E_SLOT: "" } }).slotSource,
    "worktree path",
  );
});

test("E2E_SLOT accepts 99", () => {
  assert.equal(
    resolveHarnessCoordinates({ ...worktree, env: { E2E_SLOT: "99" } }).slot,
    99,
  );
});

test("E2E_SLOT outside 0 to 99 is refused", () => {
  for (const value of ["100", "-1", "1.5", "abc", " 3", "1e1", "Infinity", "0x5"]) {
    assert.throws(
      () => resolveHarnessCoordinates({ ...worktree, env: { E2E_SLOT: value } }),
      /E2E_SLOT must be a whole number from 0 to 99/,
      value,
    );
  }
});

test("empty port overrides are ignored", () => {
  const coordinates = resolveHarnessCoordinates({
    ...mainCheckout,
    env: { PLAYWRIGHT_POSTGRES_PORT: "", PLAYWRIGHT_APP_PORT: "" },
  });

  assert.equal(coordinates.e2e.postgresPort, "55432");
  assert.equal(coordinates.e2e.appPort, "3100");
});

test("PLAYWRIGHT_POSTGRES_PORT and PLAYWRIGHT_APP_PORT override e2e only", () => {
  const coordinates = resolveHarnessCoordinates({
    ...worktree,
    env: { PLAYWRIGHT_POSTGRES_PORT: "6000", PLAYWRIGHT_APP_PORT: "4000" },
  });

  assert.equal(coordinates.e2e.postgresPort, "6000");
  assert.equal(coordinates.e2e.appPort, "4000");
  assert.equal(
    coordinates.testDb.postgresPort,
    String(55600 + coordinates.slot),
  );
});

test("PLAYWRIGHT_DATABASE_URL points both commands elsewhere", () => {
  const coordinates = resolveHarnessCoordinates({
    ...worktree,
    env: { PLAYWRIGHT_DATABASE_URL: "postgresql://ci@127.0.0.1:55432/postgres" },
  });

  assert.equal(
    coordinates.e2e.databaseUrl,
    "postgresql://ci@127.0.0.1:55432/postgres",
  );
  assert.equal(
    coordinates.testDb.databaseUrl,
    "postgresql://ci@127.0.0.1:55432/postgres",
  );
});

test("an empty PLAYWRIGHT_DATABASE_URL is ignored", () => {
  // resolveDatabaseUrl() skips an empty override and falls through to .env's
  // URLs, which point at the dev database, so an empty one must never be
  // passed on.
  const coordinates = resolveHarnessCoordinates({
    ...mainCheckout,
    env: { PLAYWRIGHT_DATABASE_URL: "" },
  });

  assert.equal(coordinates.e2e.databaseUrl, url("55432"));
  assert.equal(coordinates.testDb.databaseUrl, url("55600"));
});

test("empty Postgres credentials fall back to the compose file's defaults", () => {
  // docker-compose.playwright.yml's `${VAR:-default}` treats an empty value as
  // unset, so the URL has to as well or the harness cannot log in.
  const coordinates = resolveHarnessCoordinates({
    ...mainCheckout,
    env: { POSTGRES_USER: "", POSTGRES_PASSWORD: "", POSTGRES_DB: "" },
  });

  assert.deepEqual(coordinates.postgres, defaultPostgres);
  assert.equal(coordinates.e2e.databaseUrl, url("55432"));
});

test("Postgres credentials are used and URL-encoded", () => {
  const coordinates = resolveHarnessCoordinates({
    ...mainCheckout,
    env: { POSTGRES_USER: "shelter", POSTGRES_PASSWORD: "p@ss:word", POSTGRES_DB: "e2e" },
  });

  assert.equal(
    coordinates.e2e.databaseUrl,
    "postgresql://shelter:p%40ss%3Aword@127.0.0.1:55432/e2e",
  );
  assert.equal(
    coordinates.testDb.databaseUrl,
    "postgresql://shelter:p%40ss%3Aword@127.0.0.1:55600/e2e",
  );
});
