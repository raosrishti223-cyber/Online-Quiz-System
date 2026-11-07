import { createServer as createHttpServer } from "node:http";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidQuestionSet, toPublicQuestion } from "./db.js";
import { createQuestionStore } from "./questionStore.js";

const frontendDirectory = resolve(fileURLToPath(new URL("../frontend/", import.meta.url)));
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);
const maximumBodySize = 64 * 1024;
const sessionLifetimeMs = 8 * 60 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(value === undefined ? undefined : JSON.stringify(value));
}

function readJsonBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")) {
    throw new HttpError(415, "Send the request as JSON.");
  }

  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    let tooLarge = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (tooLarge) {
        return;
      }
      body += chunk;
      if (Buffer.byteLength(body) > maximumBodySize) {
        tooLarge = true;
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        rejectBody(new HttpError(413, "The request is too large."));
        return;
      }
      try {
        resolveBody(JSON.parse(body));
      } catch {
        rejectBody(new HttpError(400, "The request body must contain valid JSON."));
      }
    });
    request.on("error", rejectBody);
  });
}

function credentialsMatch(provided, expected) {
  const providedBuffer = Buffer.from(typeof provided === "string" ? provided : "");
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer);
}

function getSessionToken(request) {
  const cookies = request.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === "quiz_admin_session") {
      return valueParts.join("=");
    }
  }
  return "";
}

function requestHasAdminSession(request, sessions) {
  const token = getSessionToken(request);
  const expiresAt = sessions.get(token);
  if (!expiresAt) {
    return false;
  }
  if (expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function assertSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) {
    return;
  }
  try {
    if (new URL(origin).host !== request.headers.host) {
      throw new HttpError(403, "Cross-origin changes are not allowed.");
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(403, "The request origin is invalid.");
  }
}

function validateQuestionInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Provide a question, four options, and a correct answer.");
  }
  const candidate = {
    id: 1,
    question: value.question,
    options: value.options,
    correctAnswer: value.correctAnswer
  };
  if (!isValidQuestionSet([candidate])) {
    throw new HttpError(400, "Enter a question, four non-empty options, and a valid correct answer.");
  }
  return {
    question: value.question.trim(),
    options: value.options.map((option) => option.trim()),
    correctAnswer: value.correctAnswer
  };
}

async function handleApiRequest(request, response, pathname, store, sessions, credentials) {
  if (pathname === "/api/questions") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      throw new HttpError(405, "Method not allowed.");
    }
    const questionSet = await store.getAll();
    if (!isValidQuestionSet(questionSet) || questionSet.length === 0) {
      throw new Error("Stored question data is invalid.");
    }
    sendJson(response, 200, request.method === "HEAD"
      ? undefined
      : questionSet.map(toPublicQuestion));
    return;
  }

  if (pathname === "/api/quiz/submit") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Method not allowed.");
    }
    assertSameOrigin(request);
    const body = await readJsonBody(request);
    if (!body || !Array.isArray(body.answers)) {
      throw new HttpError(400, "Provide the selected answer for each question.");
    }

    const questionSet = await store.getAll();
    const questionById = new Map(questionSet.map((question) => [question.id, question]));
    const answersById = new Map();
    for (const answer of body.answers) {
      if (!answer || !Number.isInteger(answer.questionId) || !questionById.has(answer.questionId)) {
        throw new HttpError(400, "An answer references an unknown question.");
      }
      if (answersById.has(answer.questionId)) {
        throw new HttpError(400, "Each question may only be answered once.");
      }
      const selectedAnswer = answer.selectedAnswer;
      const question = questionById.get(answer.questionId);
      if (selectedAnswer !== null
        && (!Number.isInteger(selectedAnswer)
          || selectedAnswer < 0
          || selectedAnswer >= question.options.length)) {
        throw new HttpError(400, "Select one of the four available options.");
      }
      answersById.set(answer.questionId, selectedAnswer);
    }

    let correctAnswers = 0;
    let incorrectAnswers = 0;
    let unansweredQuestions = 0;
    for (const question of questionSet) {
      const selectedAnswer = answersById.get(question.id);
      if (selectedAnswer === undefined || selectedAnswer === null) {
        unansweredQuestions += 1;
      } else if (selectedAnswer === question.correctAnswer) {
        correctAnswers += 1;
      } else {
        incorrectAnswers += 1;
      }
    }
    sendJson(response, 200, {
      totalQuestions: questionSet.length,
      correctAnswers,
      incorrectAnswers,
      unansweredQuestions,
      scorePercentage: Math.round((correctAnswers / questionSet.length) * 100)
    });
    return;
  }

  if (pathname === "/api/admin/login") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Method not allowed.");
    }
    assertSameOrigin(request);
    if (!credentials.username || !credentials.password) {
      throw new HttpError(503, "Administrator credentials are not configured on the server.");
    }
    const body = await readJsonBody(request);
    if (!credentialsMatch(body?.username, credentials.username)
      || !credentialsMatch(body?.password, credentials.password)) {
      throw new HttpError(401, "The username or password is incorrect.");
    }

    const token = randomBytes(32).toString("base64url");
    sessions.set(token, Date.now() + sessionLifetimeMs);
    const secure = request.socket.encrypted ? "; Secure" : "";
    sendJson(response, 200, { authenticated: true }, {
      "Set-Cookie": `quiz_admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionLifetimeMs / 1000}${secure}`
    });
    return;
  }

  if (pathname === "/api/admin/logout") {
    if (request.method !== "POST") {
      throw new HttpError(405, "Method not allowed.");
    }
    assertSameOrigin(request);
    sessions.delete(getSessionToken(request));
    sendJson(response, 200, { authenticated: false }, {
      "Set-Cookie": "quiz_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
    });
    return;
  }

  if (pathname === "/api/admin/session" && request.method === "GET") {
    sendJson(response, 200, {
      authenticated: requestHasAdminSession(request, sessions)
    });
    return;
  }

  if (pathname.startsWith("/api/admin/")) {
    if (!requestHasAdminSession(request, sessions)) {
      throw new HttpError(401, "Log in as an administrator to continue.");
    }
    assertSameOrigin(request);
    if (pathname === "/api/admin/questions" && request.method === "GET") {
      const questionSet = await store.getAll();
      sendJson(response, 200, questionSet);
      return;
    }
    if (pathname === "/api/admin/questions" && request.method === "POST") {
      const question = validateQuestionInput(await readJsonBody(request));
      const created = await store.add(question);
      sendJson(response, 201, created);
      return;
    }

    const questionMatch = pathname.match(/^\/api\/admin\/questions\/(\d+)$/);
    if (questionMatch && request.method === "PUT") {
      const id = Number(questionMatch[1]);
      const question = validateQuestionInput(await readJsonBody(request));
      const updated = await store.update(id, question);
      if (!updated) {
        throw new HttpError(404, "Question not found.");
      }
      sendJson(response, 200, updated);
      return;
    }
    if (questionMatch && request.method === "DELETE") {
      const result = await store.remove(Number(questionMatch[1]));
      if (result.reason === "last-question") {
        throw new HttpError(409, "At least one question must remain in the quiz.");
      }
      if (!result.removed) {
        throw new HttpError(404, "Question not found.");
      }
      sendJson(response, 200, result);
      return;
    }

    throw new HttpError(405, "Method not allowed.");
  }

  throw new HttpError(404, "Not found.");
}

async function handleRequest(request, response, store, sessions, credentials) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid request URL." });
    return;
  }

  if (pathname.startsWith("/api/")) {
    try {
      await handleApiRequest(request, response, pathname, store, sessions, credentials);
    } catch (error) {
      if (response.headersSent) {
        console.error("Request failed after the response started:", error);
        response.destroy(error);
        return;
      }
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message }, error.status === 405
          ? { Allow: "GET, HEAD, POST, PUT, DELETE" }
          : {});
      } else {
        console.error("API request failed:", error);
        sendJson(response, 500, { error: "The request could not be completed." });
      }
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
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

export function createServer({
  store = createQuestionStore(),
  adminUsername = process.env.QUIZ_ADMIN_USERNAME ?? "",
  adminPassword = process.env.QUIZ_ADMIN_PASSWORD ?? ""
} = {}) {
  const sessions = new Map();
  return createHttpServer((request, response) => {
    void handleRequest(request, response, store, sessions, {
      username: adminUsername,
      password: adminPassword
    });
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
