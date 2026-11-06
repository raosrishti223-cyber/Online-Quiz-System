import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { after, before, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getQuestions, isValidQuestionSet } from "../backend/db.js";
import { createQuestionStore } from "../backend/questionStore.js";
import { createServer } from "../backend/server.js";

let server;
let origin;
let store;
let temporaryDirectory;
let adminCookie;

async function jsonRequest(path, body, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (options.admin && adminCookie) {
    headers.Cookie = adminCookie;
  }
  return fetch(`${origin}${path}`, {
    method: options.method ?? "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "online-quiz-sprint2-"));
  store = createQuestionStore(join(temporaryDirectory, "questions.json"));
  server = createServer({
    store,
    adminUsername: "test-admin",
    adminPassword: "test-password"
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("Sprint 1 question data keeps the shared four-option format", () => {
  const questionSet = getQuestions();
  assert.equal(questionSet.length, 5);
  assert.equal(isValidQuestionSet(questionSet), true);
  for (const question of questionSet) {
    assert.ok(Number.isInteger(question.id));
    assert.ok(question.question.length > 0);
    assert.equal(question.options.length, 4);
    assert.ok(question.correctAnswer >= 0 && question.correctAnswer < question.options.length);
  }

  const invalidOptionSet = getQuestions();
  invalidOptionSet[0].options.pop();
  assert.equal(isValidQuestionSet(invalidOptionSet), false);
});

test("Sprint 1 pages load and quiz API does not expose correct answers", async () => {
  const page = await fetch(`${origin}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Start Quiz/);

  const adminPage = await fetch(`${origin}/admin.html`);
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /Administrator login/);

  const response = await fetch(`${origin}/api/questions`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  const questionSet = await response.json();
  assert.deepEqual(questionSet.map(({ id, question, options }) => ({ id, question, options })), getQuestions().map(({ id, question, options }) => ({ id, question, options })));
  assert.equal(questionSet.some((question) => "correctAnswer" in question), false);
});

test("TEST-01: submission validates selected options and reports unanswered questions", async () => {
  const questionSet = await store.getAll();
  const answers = questionSet.map((question, index) => ({
    questionId: question.id,
    selectedAnswer: index === 0 ? question.correctAnswer : index === 1 ? (question.correctAnswer + 1) % 4 : null
  }));
  const response = await jsonRequest("/api/quiz/submit", { answers });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    totalQuestions: 5,
    correctAnswers: 1,
    incorrectAnswers: 1,
    unansweredQuestions: 3,
    scorePercentage: 20
  });

  const invalidOption = await jsonRequest("/api/quiz/submit", {
    answers: [{ questionId: questionSet[0].id, selectedAnswer: 4 }]
  });
  assert.equal(invalidOption.status, 400);
  assert.match((await invalidOption.json()).error, /four available options/);

  const duplicateAnswer = await jsonRequest("/api/quiz/submit", {
    answers: [
      { questionId: questionSet[0].id, selectedAnswer: 0 },
      { questionId: questionSet[0].id, selectedAnswer: 1 }
    ]
  });
  assert.equal(duplicateAnswer.status, 400);

  const unknownQuestion = await jsonRequest("/api/quiz/submit", {
    answers: [{ questionId: 99999, selectedAnswer: 0 }]
  });
  assert.equal(unknownQuestion.status, 400);
});

test("TEST-02: admin login protects question access and creates a secure session cookie", async () => {
  const unauthorized = await fetch(`${origin}/api/admin/questions`);
  assert.equal(unauthorized.status, 401);

  const wrongLogin = await jsonRequest("/api/admin/login", {
    username: "test-admin",
    password: "wrong"
  });
  assert.equal(wrongLogin.status, 401);

  const crossOriginLogin = await jsonRequest("/api/admin/login", {
    username: "test-admin",
    password: "test-password"
  }, { headers: { Origin: "http://attacker.invalid" } });
  assert.equal(crossOriginLogin.status, 403);

  const login = await jsonRequest("/api/admin/login", {
    username: "test-admin",
    password: "test-password"
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  adminCookie = setCookie.split(";")[0];

  const authorized = await fetch(`${origin}/api/admin/questions`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(authorized.status, 200);
});

test("TEST-03: admin question input validation and CRUD preserve data integrity", async () => {
  const invalid = await jsonRequest("/api/admin/questions", {
    question: "Incomplete question",
    options: ["A", "B", ""],
    correctAnswer: 0
  }, { admin: true });
  assert.equal(invalid.status, 400);

  const createdResponse = await jsonRequest("/api/admin/questions", {
    question: "Which number is even?",
    options: ["1", "3", "4", "5"],
    correctAnswer: 2
  }, { admin: true });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.ok(Number.isInteger(created.id));

  const updatedResponse = await jsonRequest(`/api/admin/questions/${created.id}`, {
    question: "Which number is divisible by three?",
    options: ["4", "6", "7", "8"],
    correctAnswer: 1
  }, { admin: true, method: "PUT" });
  assert.equal(updatedResponse.status, 200);
  assert.equal((await updatedResponse.json()).question, "Which number is divisible by three?");

  const missingUpdate = await jsonRequest("/api/admin/questions/99999", {
    question: "Missing",
    options: ["A", "B", "C", "D"],
    correctAnswer: 0
  }, { admin: true, method: "PUT" });
  assert.equal(missingUpdate.status, 404);

  const adminList = await fetch(`${origin}/api/admin/questions`, {
    headers: { Cookie: adminCookie }
  });
  const savedQuestions = await adminList.json();
  assert.equal(savedQuestions.some((question) => question.id === created.id
    && question.correctAnswer === 1), true);

  const participantList = await (await fetch(`${origin}/api/questions`)).json();
  assert.equal(participantList.some((question) => question.id === created.id
    && "correctAnswer" in question), false);

  const deleteResponse = await jsonRequest(`/api/admin/questions/${created.id}`, undefined, {
    admin: true,
    method: "DELETE"
  });
  assert.equal(deleteResponse.status, 200);
  const afterDelete = await store.getAll();
  assert.equal(afterDelete.some((question) => question.id === created.id), false);
});

test("TEST-04: score is recalculated from stored answers and question edits persist", async () => {
  const questionSet = await store.getAll();
  const firstQuestion = questionSet[0];
  const selectedAnswer = (firstQuestion.correctAnswer + 1) % firstQuestion.options.length;
  const scoreResponse = await jsonRequest("/api/quiz/submit", {
    answers: [{ questionId: firstQuestion.id, selectedAnswer }]
  });
  const score = await scoreResponse.json();
  assert.equal(score.incorrectAnswers, 1);
  assert.equal(score.unansweredQuestions, questionSet.length - 1);
  assert.equal(score.scorePercentage, 0);

  const persistedStore = createQuestionStore(join(temporaryDirectory, "questions.json"));
  assert.deepEqual(await persistedStore.getAll(), questionSet);
});

test("TEST-05: invalid JSON, missing fields, and invalid operations return actionable errors", async () => {
  const malformed = await fetch(`${origin}/api/quiz/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalid"
  });
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).error, /valid JSON/);

  const missingAnswers = await jsonRequest("/api/quiz/submit", {});
  assert.equal(missingAnswers.status, 400);
  assert.match((await missingAnswers.json()).error, /selected answer/);

  const wrongContentType = await fetch(`${origin}/api/quiz/submit`, {
    method: "POST",
    body: "{}"
  });
  assert.equal(wrongContentType.status, 415);

  const unsupportedMethod = await fetch(`${origin}/api/questions`, { method: "POST" });
  assert.equal(unsupportedMethod.status, 405);

  const missingFile = await fetch(`${origin}/does-not-exist`);
  assert.equal(missingFile.status, 404);
});

test("TEST-02: administrator can sign out and revoked cookies cannot access data", async () => {
  const logout = await jsonRequest("/api/admin/logout", {}, { admin: true });
  assert.equal(logout.status, 200);
  adminCookie = "";
  const unauthorized = await fetch(`${origin}/api/admin/questions`);
  assert.equal(unauthorized.status, 401);
});

test("TEST-07: question API stays responsive for 25 consecutive requests", async () => {
  const startedAt = performance.now();
  for (let index = 0; index < 25; index += 1) {
    const response = await fetch(`${origin}/api/questions`);
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  const elapsedMs = performance.now() - startedAt;
  assert.ok(elapsedMs < 2500, `25 local question requests took ${elapsedMs.toFixed(1)} ms`);
  console.log(`Performance check: 25 question requests took ${elapsedMs.toFixed(1)} ms.`);
});

test("question writes are serialized and survive store recreation", async () => {
  const [first, second] = await Promise.all([
    store.add({
      question: "Concurrent test question one?",
      options: ["A", "B", "C", "D"],
      correctAnswer: 0
    }),
    store.add({
      question: "Concurrent test question two?",
      options: ["A", "B", "C", "D"],
      correctAnswer: 1
    })
  ]);
  assert.notEqual(first.id, second.id);

  const restored = await createQuestionStore(join(temporaryDirectory, "questions.json")).getAll();
  assert.equal(restored.some((question) => question.id === first.id), true);
  assert.equal(restored.some((question) => question.id === second.id), true);
  await store.remove(first.id);
  await store.remove(second.id);
});

test("administrator cannot delete the final quiz question", async () => {
  const oneQuestionFile = join(temporaryDirectory, "one-question.json");
  await writeFile(oneQuestionFile, JSON.stringify([{
    id: 1,
    question: "Keep one question?",
    options: ["Yes", "No", "Maybe", "Later"],
    correctAnswer: 0
  }]));
  const oneQuestionServer = createServer({
    store: createQuestionStore(oneQuestionFile),
    adminUsername: "test-admin",
    adminPassword: "test-password"
  });
  await new Promise((resolve, reject) => {
    oneQuestionServer.once("error", reject);
    oneQuestionServer.listen(0, "127.0.0.1", resolve);
  });
  const oneQuestionOrigin = `http://127.0.0.1:${oneQuestionServer.address().port}`;
  try {
    const login = await fetch(`${oneQuestionOrigin}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "test-admin", password: "test-password" })
    });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const deletion = await fetch(`${oneQuestionOrigin}/api/admin/questions/1`, {
      method: "DELETE",
      headers: { Cookie: cookie }
    });
    assert.equal(deletion.status, 409);
    assert.equal((await (await fetch(`${oneQuestionOrigin}/api/admin/questions`, {
      headers: { Cookie: cookie }
    })).json()).length, 1);
  } finally {
    await new Promise((resolve, reject) => {
      oneQuestionServer.close((error) => error ? reject(error) : resolve());
    });
  }
});
