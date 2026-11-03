import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getQuestions, isValidQuestionSet } from "./db.js";

const frontendDirectory = resolve(fileURLToPath(new URL("../frontend/", import.meta.url)));
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

async function handleRequest(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400);
    response.end("Invalid request URL");
    return;
  }

  if (pathname === "/api/questions") {
    const questionSet = getQuestions();
    if (!isValidQuestionSet(questionSet)) {
      response.writeHead(500);
      response.end("Question data is invalid");
      return;
    }

    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : JSON.stringify(questionSet));
    return;
  }

  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(frontendDirectory, `.${requestedPath}`);
  const relativePath = relative(frontendDirectory, filePath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || relativePath.startsWith(sep)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  try {
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const content = request.method === "HEAD" ? undefined : await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
      "Content-Length": fileInfo.size
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    console.error("Failed to serve request:", error);
    response.writeHead(500);
    response.end("Internal server error");
  }
}

export function createServer() {
  return createHttpServer((request, response) => {
    void handleRequest(request, response);
  });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  createServer().listen(port, () => {
    console.log(`Online Quiz System is running at http://localhost:${port}`);
  });
}
