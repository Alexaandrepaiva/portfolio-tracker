import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const scriptPath = path.join(
  process.cwd(),
  ".agents/skills/issue/scripts/issue_spec_label_lib.sh"
);

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function runBash(command: string, env: Record<string, string> = {}) {
  const result = spawnSync(
    "bash",
    ["-lc", `source ${shellQuote(scriptPath)}\n${command}`],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      encoding: "utf8",
    }
  );

  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("issue_spec_label_lib.sh", () => {
  it.each([
    "# Title\nDetails",
    "- item\nMore details",
    "1. First item\nMore details",
    "- [x] Done\nMore details",
    "> Quote\nMore details",
    "```\ncode\n```\nMore details",
  ])("matches structured spec markers for %p", body => {
    const result = runBash(
      'if body_looks_like_spec "$BODY"; then echo "match"; else echo "no-match"; fi',
      { BODY: body }
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("match");
  });

  it.each(["", "(auto)", "Single line", "Summary\nPlain text"])(
    "rejects non-spec body %p",
    body => {
      const result = runBash(
        'if body_looks_like_spec "$BODY"; then echo "match"; else echo "no-match"; fi',
        { BODY: body }
      );

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("no-match");
    }
  );

  it("filters empty labels when the target is already present", () => {
    const result = runBash(
      'append_label_once "spec" "" "spec" "" "feature" | sed \'/^$/d\''
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual(["spec", "feature"]);
  });

  it("allows temp body files inside TMPDIR", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "issue-spec-label-"));
    const tempFile = path.join(tempDir, "body.md");
    fs.writeFileSync(tempFile, "# Title\nDetails\n", "utf8");

    try {
      const result = runBash(
        'if temp_body_file_path_is_allowed "$BODY_FILE"; then echo "allowed"; else echo "blocked"; fi',
        { BODY_FILE: tempFile }
      );

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("allowed");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("blocks body files outside TMPDIR and /tmp", () => {
    const repoTempDir = fs.mkdtempSync(
      path.join(process.cwd(), ".tmp-issue-spec-label-")
    );
    const repoTempFile = path.join(repoTempDir, "body.md");
    fs.writeFileSync(repoTempFile, "# Title\nDetails\n", "utf8");

    try {
      const result = runBash(
        'if temp_body_file_path_is_allowed "$BODY_FILE"; then echo "allowed"; else echo "blocked"; fi',
        { BODY_FILE: repoTempFile }
      );

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("blocked");
    } finally {
      fs.rmSync(repoTempDir, { recursive: true, force: true });
    }
  });
});
