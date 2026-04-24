import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function installCCHooks(): void {
  const claudeDir = join(homedir(), ".claude");
  mkdirSync(claudeDir, { recursive: true });

  const settings = {
    hooks: {
      Stop: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: "/app/hooks/on-stop.sh",
              timeout: 10,
            },
          ],
        },
      ],
    },
  };

  writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(settings, null, 2));

  console.log("✓ CC hooks installed");
}
