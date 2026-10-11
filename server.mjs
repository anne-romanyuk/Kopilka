import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";

const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || "0.0.0.0";
const root = process.cwd();
const dataFile = process.env.DATA_FILE
  ? resolve(process.env.DATA_FILE)
  : join(root, "data", "state.json");

const defaultState = {
  saved: 0,
  goal: 100_000,
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

let mutationQueue = Promise.resolve();

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isValidState(value) {
  return (
    value &&
    typeof value === "object" &&
    isNonNegativeInteger(value.saved) &&
    Number.isSafeInteger(value.goal) &&
    value.goal > 0
  );
}

async function writeState(state) {
  const storedState = {
    saved: state.saved,
    goal: state.goal,
    updatedAt: new Date().toISOString(),
  };

  await mkdir(dirname(dataFile), { recursive: true });

  const temporaryFile = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(storedState, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryFile, dataFile);

  return storedState;
}

async function readState() {
  try {
    const contents = await readFile(dataFile, "utf8");
    const state = JSON.parse(contents);

    if (!isValidState(state)) {
      throw new Error(`Invalid state in ${dataFile}`);
    }

    return state;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return writeState(defaultState);
    }

    throw error;
  }
}

function mutateState(mutator) {
  const mutation = mutationQueue.then(async () => {
    const currentState = await readState();
    const nextState = mutator(currentState);

    if (!isValidState(nextState)) {
      throw new Error("Mutation produced an invalid state");
    }

    return writeState(nextState);
  });

  mutationQueue = mutation.catch(() => undefined);
  return mutation;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > 16 * 1024) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON");
    error.statusCode = 400;
    throw error;
  }
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/state" && request.method === "GET") {
    sendJson(response, 200, await readState());
    return true;
  }

  if (pathname === "/api/state/add" && request.method === "POST") {
    const body = await readJsonBody(request);

    if (!Number.isSafeInteger(body.amount) || body.amount <= 0) {
      sendJson(response, 400, { error: "Сумма должна быть целым числом больше нуля" });
      return true;
    }

    const state = await mutateState((currentState) => ({
      ...currentState,
      saved: currentState.saved + body.amount,
    }));

    sendJson(response, 200, state);
    return true;
  }

  if (pathname === "/api/state" && request.method === "PUT") {
    const body = await readJsonBody(request);
    const hasSaved = Object.hasOwn(body, "saved");
    const hasGoal = Object.hasOwn(body, "goal");

    if (!hasSaved && !hasGoal) {
      sendJson(response, 400, { error: "Укажите saved или goal" });
      return true;
    }

    if (hasSaved && !isNonNegativeInteger(body.saved)) {
      sendJson(response, 400, { error: "Накопления должны быть целым числом от нуля" });
      return true;
    }

    if (hasGoal && (!Number.isSafeInteger(body.goal) || body.goal <= 0)) {
      sendJson(response, 400, { error: "Стоимость должна быть целым числом больше нуля" });
      return true;
    }

    const state = await mutateState((currentState) => ({
      ...currentState,
      ...(hasSaved ? { saved: body.saved } : {}),
      ...(hasGoal ? { goal: body.goal } : {}),
    }));

    sendJson(response, 200, state);
    return true;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "API endpoint not found" });
    return true;
  }

  return false;
}

function serveStatic(request, response, pathname) {
  if (pathname.startsWith("/data/") || pathname === "/data") {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = normalize(decodeURIComponent(requestedPath)).replace(
    /^(\.\.(\/|\\|$))+/,
    "",
  );
  const filePath = join(root, normalizedPath);

  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

await readState();

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (await handleApi(request, response, url.pathname)) {
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }

    serveStatic(request, response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, error?.statusCode || 500, {
      error: error?.statusCode ? error.message : "Не удалось сохранить данные",
    });
  }
}).listen(port, host, () => {
  console.log(`Savings tracker: http://${host}:${port}`);
  console.log(`Data file: ${dataFile}`);
});
