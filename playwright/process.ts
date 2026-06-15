import { execFile } from "node:child_process";

type RunCommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  silent?: boolean;
};

export const runCommand = (
  command: string,
  args: string[],
  options: RunCommandOptions = {},
) => {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd ?? process.cwd(),
        env: options.env,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (!options.silent) {
          if (stdout) {
            process.stdout.write(stdout);
          }

          if (stderr) {
            process.stderr.write(stderr);
          }
        }

        if (error) {
          reject(
            new Error(
              [
                `Command failed: ${command} ${args.join(" ")}`,
                stdout && `stdout:\n${stdout}`,
                stderr && `stderr:\n${stderr}`,
              ]
                .filter(Boolean)
                .join("\n\n"),
            ),
          );
          return;
        }

        resolve({ stdout, stderr });
      },
    );
  });
};

