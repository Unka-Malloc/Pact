function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

const baseUrl = String(argValue("--url", process.env.AGENTSTUDIO_MCP_BASE_URL || "http://127.0.0.1:8787")).replace(/\/+$/, "");
const response = await fetch(`${baseUrl}/api/mcp/discovery`);
const text = await response.text();
if (!response.ok) {
  console.error(`MCP discovery failed: ${response.status} ${text}`);
  process.exit(1);
}
console.log(JSON.stringify(JSON.parse(text), null, 2));
