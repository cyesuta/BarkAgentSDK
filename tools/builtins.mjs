/**
 * BarkSDK — Built-in tools (local file tools, shell, web_search, fetch_url)
 *
 * No external dependencies. DuckDuckGo HTML scraping for search,
 * native fetch() for URL retrieval.
 */

import { defineAction } from "./action.mjs";
import fs from "node:fs";
import path from "node:path";

export const BUILTIN_TOOL_NAMES = [
  "Read",
  "Glob",
  "Grep",
  "Write",
  "Edit",
  "MultiEdit",
  "Bash",
  "web_search",
  "fetch_url",
];

/**
 * Register built-in tools.
 * @param {string} workspace
 * @param {{allowed?: string[]}} [options]
 * @returns {Array}
 */
export function registerBuiltinActions(workspace = "", options = {}) {
  const allowed = Array.isArray(options.allowed) ? new Set(options.allowed) : null;
  const actions = [
    defineAction(
      "Read",
      "Read a UTF-8 text file from the local filesystem. Absolute paths are allowed; relative paths resolve from the current workspace.",
      {
        type: "object",
        properties: {
          file_path: { type: "string", description: "File path, absolute or relative to the workspace." },
          offset: { type: "integer", description: "1-based line number to start from. Defaults to 1." },
          limit: { type: "integer", description: "Maximum number of lines to return. Defaults to 2000." },
        },
        required: ["file_path"],
      },
      (params) => readFileTool(workspace, params)
    ),
    defineAction(
      "Glob",
      "Find files on the local filesystem using a glob pattern such as **/*.js or src/**/*.rs. Absolute search paths are allowed.",
      {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern relative to the workspace." },
          path: { type: "string", description: "Optional directory to search in, relative to the workspace." },
          limit: { type: "integer", description: "Maximum number of paths to return. Defaults to 200." },
        },
        required: ["pattern"],
      },
      (params) => globTool(workspace, params)
    ),
    defineAction(
      "Grep",
      "Search local text files for a regular expression. Absolute search paths are allowed.",
      {
        type: "object",
        properties: {
          pattern: { type: "string", description: "JavaScript regular expression pattern to search for." },
          path: { type: "string", description: "Optional file or directory to search in. Defaults to workspace root." },
          glob: { type: "string", description: "Optional glob filter, for example **/*.js." },
          ignore_case: { type: "boolean", description: "Case-insensitive search." },
          limit: { type: "integer", description: "Maximum number of matching lines to return. Defaults to 200." },
        },
        required: ["pattern"],
      },
      (params) => grepTool(workspace, params)
    ),
    defineAction(
      "Write",
      "Write a UTF-8 text file inside the current workspace, creating parent directories if needed.",
      {
        type: "object",
        properties: {
          file_path: { type: "string", description: "File path, absolute or relative to the workspace." },
          content: { type: "string", description: "Complete file content to write." },
        },
        required: ["file_path", "content"],
      },
      (params) => writeFileTool(workspace, params)
    ),
    defineAction(
      "Edit",
      "Edit a UTF-8 text file by replacing an exact string inside the current workspace.",
      {
        type: "object",
        properties: {
          file_path: { type: "string", description: "File path, absolute or relative to the workspace." },
          old_string: { type: "string", description: "Exact text to replace." },
          new_string: { type: "string", description: "Replacement text." },
          replace_all: { type: "boolean", description: "Replace every occurrence instead of requiring exactly one." },
        },
        required: ["file_path", "old_string", "new_string"],
      },
      (params) => editFileTool(workspace, params)
    ),
    defineAction(
      "MultiEdit",
      "Apply multiple exact-string edits to one UTF-8 text file inside the current workspace.",
      {
        type: "object",
        properties: {
          file_path: { type: "string", description: "File path, absolute or relative to the workspace." },
          edits: {
            type: "array",
            items: {
              type: "object",
              properties: {
                old_string: { type: "string" },
                new_string: { type: "string" },
                replace_all: { type: "boolean" },
              },
              required: ["old_string", "new_string"],
            },
          },
        },
        required: ["file_path", "edits"],
      },
      (params) => multiEditTool(workspace, params)
    ),
    defineAction(
      "Bash",
      "Run a shell command in the current workspace and return stdout/stderr. Use for inspection, builds, and tests.",
      {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute." },
          timeout_ms: { type: "integer", description: "Timeout in milliseconds. Defaults to 30000, max 120000." },
        },
        required: ["command"],
      },
      (params) => bashTool(workspace, params)
    ),
    defineAction(
      "web_search",
      "Search the web for current information (news, recent events, anything outside training cutoff). Returns up to 5 results with title, URL, and snippet.",
      {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query. Use the user's language (中文 query for 中文 results when relevant).",
          },
        },
        required: ["query"],
      },
      webSearch
    ),
    defineAction(
      "fetch_url",
      "Fetch a URL and return its content as plain text (HTML stripped, truncated to ~8KB).",
      {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Absolute URL (must start with http:// or https://)",
          },
        },
        required: ["url"],
      },
      fetchUrlHandler
    ),
  ];
  return allowed
    ? actions.filter((action) => allowed.has(action?.spec?.function?.name))
    : actions;
}

function requireWorkspace(workspace) {
  if (!String(workspace || "").trim()) {
    throw new Error("Workspace is not set; refusing local file operation.");
  }
  const root = path.resolve(workspace || "");
  if (!root || root === path.parse(root).root) {
    throw new Error("Workspace is not set; refusing local file operation.");
  }
  return root;
}

function resolveInsideWorkspace(workspace, inputPath, { allowRoot = false } = {}) {
  const root = requireWorkspace(workspace);
  const raw = String(inputPath || "").trim();
  if (!raw) throw new Error("Missing file path.");
  const resolved = path.resolve(root, raw);
  const rel = path.relative(root, resolved);
  if ((!allowRoot && rel === "") || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes workspace: ${raw}`);
  }
  return { root, resolved, rel: rel.replace(/\\/g, "/") };
}

function resolveLocalPath(workspace, inputPath) {
  const raw = String(inputPath || "").trim();
  if (!raw) throw new Error("Missing file path.");
  const root = String(workspace || "").trim() ? path.resolve(workspace) : process.cwd();
  const resolved = path.resolve(root, raw);
  return { root, resolved, rel: path.isAbsolute(raw) ? resolved : path.relative(root, resolved).replace(/\\/g, "/") };
}

function displayPath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function readUtf8File(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error("Path is not a file.");
  if (stat.size > 5 * 1024 * 1024) {
    throw new Error(`File is too large to read directly (${stat.size} bytes). Use Grep or a smaller file.`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

async function readFileTool(workspace, params) {
  const { resolved, rel } = resolveLocalPath(workspace, params.file_path);
  const text = readUtf8File(resolved);
  const lines = text.split(/\r?\n/);
  const offset = Math.max(1, Number(params.offset || 1));
  const limit = Math.min(5000, Math.max(1, Number(params.limit || 2000)));
  const selected = lines.slice(offset - 1, offset - 1 + limit);
  const body = selected.map((line, i) => `${String(offset + i).padStart(5, " ")}\t${line}`).join("\n");
  const truncated = offset - 1 + limit < lines.length ? `\n[truncated: ${lines.length - (offset - 1 + limit)} more lines]` : "";
  return `File: ${rel}\nLines: ${offset}-${offset + selected.length - 1} of ${lines.length}\n\n${body}${truncated}`;
}

async function writeFileTool(workspace, params) {
  const { resolved, rel } = resolveInsideWorkspace(workspace, params.file_path);
  const content = String(params.content ?? "");
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, "utf-8");
  return `Wrote ${Buffer.byteLength(content, "utf-8")} bytes to ${rel}.`;
}

function applyExactEdit(text, oldString, newString, replaceAll) {
  if (oldString === "") throw new Error("old_string must not be empty.");
  const first = text.indexOf(oldString);
  if (first === -1) throw new Error("old_string was not found.");
  if (!replaceAll && text.indexOf(oldString, first + oldString.length) !== -1) {
    throw new Error("old_string appears more than once; pass replace_all=true or provide a more specific string.");
  }
  if (replaceAll) {
    return { text: text.split(oldString).join(newString), count: text.split(oldString).length - 1 };
  }
  return {
    text: text.slice(0, first) + newString + text.slice(first + oldString.length),
    count: 1,
  };
}

async function editFileTool(workspace, params) {
  const { resolved, rel } = resolveInsideWorkspace(workspace, params.file_path);
  const text = readUtf8File(resolved);
  const result = applyExactEdit(
    text,
    String(params.old_string ?? ""),
    String(params.new_string ?? ""),
    params.replace_all === true
  );
  fs.writeFileSync(resolved, result.text, "utf-8");
  return `Edited ${rel}: replaced ${result.count} occurrence(s).`;
}

async function multiEditTool(workspace, params) {
  const { resolved, rel } = resolveInsideWorkspace(workspace, params.file_path);
  if (!Array.isArray(params.edits) || params.edits.length === 0) {
    throw new Error("edits must be a non-empty array.");
  }
  let text = readUtf8File(resolved);
  let total = 0;
  for (const edit of params.edits) {
    const result = applyExactEdit(
      text,
      String(edit.old_string ?? ""),
      String(edit.new_string ?? ""),
      edit.replace_all === true
    );
    text = result.text;
    total += result.count;
  }
  fs.writeFileSync(resolved, text, "utf-8");
  return `Edited ${rel}: applied ${params.edits.length} edit(s), replaced ${total} occurrence(s).`;
}

function walkFiles(root, startDir, limit = 5000) {
  const out = [];
  const stack = [startDir];
  const skip = new Set([".git", "node_modules", "target", "dist", "build", ".next", ".vite"]);
  while (stack.length > 0 && out.length < limit) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}

function globToRegex(pattern) {
  const p = String(pattern || "**/*").replace(/\\/g, "/");
  let out = "^";
  for (let i = 0; i < p.length;) {
    const ch = p[i];
    if (ch === "*" && p[i + 1] === "*" && p[i + 2] === "/") {
      out += "(?:.*/)?";
      i += 3;
    } else if (ch === "*" && p[i + 1] === "*") {
      out += ".*";
      i += 2;
    } else if (ch === "*") {
      out += "[^/]*";
      i += 1;
    } else if (ch === "?") {
      out += "[^/]";
      i += 1;
    } else {
      out += ch.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
      i += 1;
    }
  }
  out += "$";
  return new RegExp(out);
}

async function globTool(workspace, params) {
  const { root, resolved: searchPath } = params.path
    ? resolveLocalPath(workspace, params.path)
    : { root: String(workspace || "").trim() ? path.resolve(workspace) : process.cwd(), resolved: String(workspace || "").trim() ? path.resolve(workspace) : process.cwd() };
  const stat = fs.statSync(searchPath);
  if (!stat.isDirectory()) throw new Error("Glob path must be a directory.");
  const limit = Math.min(1000, Math.max(1, Number(params.limit || 200)));
  const rx = globToRegex(params.pattern || "**/*");
  const matches = [];
  for (const file of walkFiles(root, searchPath)) {
    const rel = displayPath(root, file);
    const localRel = path.relative(searchPath, file).replace(/\\/g, "/");
    if (rx.test(rel) || rx.test(localRel)) {
      matches.push(rel);
      if (matches.length >= limit) break;
    }
  }
  return matches.length ? matches.join("\n") : `No files matched ${params.pattern}`;
}

async function grepTool(workspace, params) {
  const { root, resolved: target } = params.path
    ? resolveLocalPath(workspace, params.path)
    : { root: String(workspace || "").trim() ? path.resolve(workspace) : process.cwd(), resolved: String(workspace || "").trim() ? path.resolve(workspace) : process.cwd() };
  const flags = params.ignore_case ? "i" : "";
  const rx = new RegExp(String(params.pattern || ""), flags);
  const globRx = params.glob ? globToRegex(params.glob) : null;
  const limit = Math.min(1000, Math.max(1, Number(params.limit || 200)));
  const stat = fs.statSync(target);
  const files = stat.isDirectory() ? walkFiles(root, target) : [target];
  const matches = [];
  for (const file of files) {
    const rel = displayPath(root, file);
    if (globRx && !globRx.test(rel)) continue;
    let text;
    try { text = readUtf8File(file); } catch { continue; }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (rx.test(lines[i])) {
        matches.push(`${rel}:${i + 1}: ${lines[i]}`);
        if (matches.length >= limit) {
          return matches.join("\n") + "\n[truncated]";
        }
      }
      rx.lastIndex = 0;
    }
  }
  return matches.length ? matches.join("\n") : `No matches for ${params.pattern}`;
}

async function bashTool(workspace, params) {
  const root = requireWorkspace(workspace);
  const command = String(params.command || "").trim();
  if (!command) throw new Error("Missing command.");
  const timeout = Math.min(120000, Math.max(1000, Number(params.timeout_ms || 30000)));
  const { exec } = await import("node:child_process");
  return await new Promise((resolve, reject) => {
    exec(command, {
      cwd: root,
      timeout,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      const out = [
        stdout ? `STDOUT:\n${stdout.trimEnd()}` : "",
        stderr ? `STDERR:\n${stderr.trimEnd()}` : "",
      ].filter(Boolean).join("\n\n") || "(no output)";
      if (err) {
        reject(new Error(`${err.message}\n${out}`.slice(0, 8000)));
      } else {
        resolve(out.slice(0, 12000));
      }
    });
  });
}

async function webSearch(params) {
  const query = (params.query || "").trim();
  if (!query) return "Empty query.";

  const url = `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`DuckDuckGo HTTP ${resp.status}`);

  const html = await resp.text();
  const results = [];
  const blockRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = blockRe.exec(html)) && results.length < 5) {
    let href = m[1];
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) { try { href = decodeURIComponent(uddg[1]); } catch {} }
    results.push({
      title: stripTags(m[2]).trim(),
      url: href,
      snippet: stripTags(m[3]).trim(),
    });
  }

  if (results.length === 0) return `No results for: ${query}`;
  return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
}


async function fetchUrlHandler(params) {
  const url = (params.url || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error(`URL must start with http:// or https://`);

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(20000),
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const ct = resp.headers.get("content-type") || "";
  const body = await resp.text();
  let text;

  if (ct.startsWith("application/json")) {
    text = body;
  } else {
    text = body
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  const MAX = 8000;
  if (text.length > MAX) {
    text = text.slice(0, MAX) + `\n\n[truncated at ${MAX} chars — full length ${body.length}]`;
  }
  return text;
}


function stripTags(s) {
  return String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
