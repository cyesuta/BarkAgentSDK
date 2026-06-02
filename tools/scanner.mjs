/**
 * BarkSDK — Action scanner (replaces discover_first_class_tools + discover_mcp_dispatcher)
 *
 * Scans project-local directories for tool manifests and registers them
 * as BarkSDK actions. Mirrors the NTR SDK's discovery conventions with
 * zero naming overlap.
 *
 * Directories scanned:
 *   <cwd>/<toolsDir>/<name>/tool.json       — first-class manifest
 *   <cwd>/src-tauri/mcp_tools/*.py           — dispatcher scripts
 */

import fs from "node:fs";
import path from "node:path";
import { defineAction } from "./action.mjs";

/**
 * Scan for first-class tool manifests.
 * @param {string} cwd
 * @param {{toolsDir?: string}} [options]
 * @returns {Promise<Array>} — array of defineAction() results
 */
export async function scanLocalActions(cwd, options = {}) {
  if (!cwd) return [];
  const toolsDir = options.toolsDir || ".barkide/tools";
  const root = path.resolve(cwd, toolsDir);
  if (!fs.existsSync(root)) return [];

  const actions = [];
  let entries;
  try { entries = fs.readdirSync(root); } catch { return []; }

  for (const entry of entries.sort()) {
    const toolDir = path.join(root, entry);
    if (!fs.statSync(toolDir).isDirectory()) continue;
    const manifestPath = path.join(toolDir, "tool.json");
    if (!fs.existsSync(manifestPath)) continue;

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch { continue; }

    const name = manifest.name;
    const description = manifest.description || name || "";
    const inputSchema = manifest.inputSchema || { type: "object", properties: {}, required: [] };
    const command = manifest.command;
    if (!name || !Array.isArray(command) || command.length === 0) continue;

    actions.push(defineAction(name, description, inputSchema, makeScriptHandler(toolDir, command)));
  }

  return actions;
}


/**
 * Scan for MCP dispatcher scripts.
 * @param {string} cwd
 * @returns {Promise<Array>} — array of defineAction() results
 */
export async function scanDispatcherTasks(cwd) {
  if (!cwd) return [];
  const root = path.join(cwd, "src-tauri", "mcp_tools");
  if (!fs.existsSync(root)) return [];

  let files;
  try { files = fs.readdirSync(root); } catch { return []; }
  const available = files
    .filter((f) => f.endsWith(".py") && f !== "__init__.py")
    .map((f) => f.slice(0, -3))
    .sort();

  if (available.length === 0) return [];

  const description =
    "Dispatcher for project-local MCP scripts under src-tauri/mcp_tools/. " +
    "Lazy-spawns `python src-tauri/mcp_tools/<name>.py` with JSON args on stdin. " +
    `Available: ${available.join(", ")}.`;

  return [
    defineAction(
      "barkide_run_mcp_tool",
      description,
      {
        type: "object",
        properties: {
          name: { type: "string", description: "Script name (without .py)" },
          args: { type: "object", description: "Arguments passed to the script's stdin" },
        },
        required: ["name"],
      },
      makeDispatcherHandler(root, cwd, available)
    ),
  ];
}


// ── Internal handlers ──────────────────────────────────────────────────

function makeScriptHandler(toolDir, command) {
  return async (params) => {
    return await spawnCommand(command, toolDir, params);
  };
}

function makeDispatcherHandler(root, cwd, available) {
  return async (params) => {
    const targetName = params.name;
    const targetArgs = params.args || {};
    if (!targetName || typeof targetName !== "string") {
      throw new Error("Missing required arg 'name'");
    }
    if (/[/\\]|\.\./.test(targetName)) {
      throw new Error(`Invalid tool name: ${targetName}`);
    }
    const script = path.join(root, `${targetName}.py`);
    if (!fs.existsSync(script)) {
      throw new Error(`Script not found: ${targetName}. Available: ${available.join(", ")}`);
    }
    return await spawnCommand(
      ["python", script],
      cwd,
      targetArgs
    );
  };
}

async function spawnCommand(command, cwd, args) {
  const { spawn } = await import("node:child_process");
  const { stdin, stdout, stderr } = await new Promise((resolve, reject) => {
    const proc = spawn(command[0], command.slice(1), {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ code, stdout, stderr }));
    proc.stdin.write(JSON.stringify(args) + "\n");
    proc.stdin.end();
  });

  if (code !== 0) {
    const err = stderr.trim() || stdout.trim() || `exit ${code}`;
    throw new Error(`Tool exited ${code}: ${err.slice(0, 1000)}`);
  }
  return stdout.trim() || "(no output)";
}
