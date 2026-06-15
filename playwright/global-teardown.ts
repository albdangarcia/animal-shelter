import {
  E2E_DOCKER_COMPOSE_FILE,
  E2E_DOCKER_PROJECT_NAME,
  getPlaywrightEnv,
} from "./env";
import { runCommand } from "./process";

export default async function globalTeardown() {
  const env = getPlaywrightEnv();

  try {
    console.log("Stopping Playwright PostgreSQL container...");
    await runCommand(
      "docker",
      [
        "compose",
        "-p",
        E2E_DOCKER_PROJECT_NAME,
        "-f",
        E2E_DOCKER_COMPOSE_FILE,
        "down",
        "-v",
        "--remove-orphans",
      ],
      { env },
    );
  } catch (error) {
    console.error("Failed to tear down Playwright PostgreSQL.", error);
  }
}

