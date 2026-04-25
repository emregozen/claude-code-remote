import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let originalSettingsBackup: string | null = null;
const claudeDir = join(homedir(), ".claude");
const settingsPath = join(claudeDir, "settings.json");
const settingsBackupPath = join(claudeDir, "settings.json.backup.cr");

function readSettings(): Record<string, any> {
  if (existsSync(settingsPath)) {
    try {
      return JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function writeSettings(settings: Record<string, any>): void {
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

export async function installCCHooks(hookPort: number): Promise<() => Promise<void>> {
  mkdirSync(claudeDir, { recursive: true });

  // Save the original settings
  const existingSettings = readSettings();
  originalSettingsBackup = JSON.stringify(existingSettings);

  // Resolve the absolute path to on-stop.sh
  const onStopScriptPath = join(__dirname, "on-stop.sh");

  // Merge our hooks into the existing settings
  const updatedSettings = {
    ...existingSettings,
    hooks: {
      ...(existingSettings.hooks || {}),
      Stop: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: onStopScriptPath,
              timeout: 10,
            },
          ],
        },
      ],
    },
  };

  writeSettings(updatedSettings);
  console.log("✓ CC settings.json updated with Stop hook");

  // Return cleanup function
  return async () => {
    if (originalSettingsBackup) {
      try {
        const parsedBackup = JSON.parse(originalSettingsBackup);
        writeSettings(parsedBackup);
        console.log("✓ CC settings.json restored");
      } catch (error) {
        console.warn("⚠ Failed to restore settings.json:", error);
        console.warn("  You may need to manually restore from your backup.");
      }
    }
  };
}
