export type PreparedCommand = {
  display: string;
  executable: string;
  hint: string | null;
};

function hasShortFlags(command: string, flags: string[]): boolean {
  const pattern = new RegExp(`(^|\\s)-[^\\s]*[${flags.join("")}]`);
  return pattern.test(command);
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
