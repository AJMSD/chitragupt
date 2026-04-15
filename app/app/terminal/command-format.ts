export type PreparedCommand = {
  display: string;
  executable: string;
  hint: string | null;
};

const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:[A-Z0-9_]*?(?:PASSWORD|PASS|PASSWD|TOKEN|SECRET|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/i;
const SECRET_FLAG_WITH_VALUE_PATTERN =
  /(?:^|\s)(?:--(?:password|passphrase|token|secret|api-key|access-token|private-key)(?:=\S+|\s+\S+))/i;
const AUTHORIZATION_BEARER_PATTERN = /authorization\s*:\s*bearer\s+\S+/i;
const PRIVATE_KEY_CONTENT_PATTERN = /-----BEGIN\s+[A-Z ]*PRIVATE KEY-----/i;

function hasShortFlags(command: string, flags: string[]): boolean {
  const pattern = new RegExp(`(^|\\s)-[^\\s]*[${flags.join("")}]`);
  return pattern.test(command);
}

export function isSensitiveCommandForHistory(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) {
    return false;
  }

  if (PRIVATE_KEY_CONTENT_PATTERN.test(normalized)) {
    return true;
  }

  if (AUTHORIZATION_BEARER_PATTERN.test(normalized)) {
    return true;
  }

  if (SECRET_ASSIGNMENT_PATTERN.test(normalized)) {
    return true;
  }

  if (SECRET_FLAG_WITH_VALUE_PATTERN.test(normalized)) {
    return true;
  }

  return false;
}

export function sanitizeStoredCommandList(commands: string[]): string[] {
  const sanitized: string[] = [];
  for (const command of commands) {
    const normalized = command.trim();
    if (!normalized) {
      continue;
    }
    if (isSensitiveCommandForHistory(normalized)) {
      continue;
    }
    if (sanitized.includes(normalized)) {
      continue;
    }
    sanitized.push(normalized);
  }
  return sanitized;
}

export function prepareRunCommand(command: string): PreparedCommand {
  const display = command.trim();
  if (!display) {
    return { display: "", executable: "", hint: null };
  }

  const isLsCommand = /^ls(\s|$)/.test(display);
  const hasDirAndColorFlags = hasShortFlags(display, ["G", "F"]);

  if (isLsCommand && !hasDirAndColorFlags) {
    const executable = display.replace(/^ls\b/, "ls -GF");
    return {
      display,
      executable,
      hint: "Auto-added -GF so directories are easier to spot.",
    };
  }

  return { display, executable: display, hint: null };
}
