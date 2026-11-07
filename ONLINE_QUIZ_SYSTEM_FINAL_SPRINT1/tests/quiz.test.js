import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { getQuestions, isValidQuestionSet } from "../backend/db.js";
import { createServer } from "../backend/server.js";

let server;
let origin;

before(async () => {
  server = createServer();
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
});

test("sample questions use the shared four-option question format", () => {
  const questionSet = getQuestions();
  assert.equal(questionSet.length, 5);
  assert.equal(isValidQuestionSet(questionSet), true);
  for (const question of questionSet) {
    assert.ok(Number.isInteger(question.id));
    assert.ok(question.question.length > 0);
    assert.equal(question.options.length, 4);
    assert.ok(question.correctAnswer >= 0 && question.correctAnswer < question.options.length);
  }
});

test("getQuestions returns independent option arrays", () => {
  const firstRead = getQuestions();
  firstRead[0].options[0] = "changed";
  assert.notEqual(getQuestions()[0].options[0], "changed");
});

test("question validation rejects invalid options and answer indexes", () => {
  const invalidOptionSet = getQuestions();
  invalidOptionSet[0].options.pop();
  assert.equal(isValidQuestionSet(invalidOptionSet), false);

  const invalidAnswerSet = getQuestions();
  invalidAnswerSet[0].correctAnswer = 4;
  assert.equal(isValidQuestionSet(invalidAnswerSet), false);
});

test("GET /api/questions returns the question set as JSON", async () => {
  const response = await fetch(`${origin}/api/questions`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.deepEqual(await response.json(), getQuestions());
});

test("GET / serves the start page", async () => {
  const response = await fetch(`${origin}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(await response.text(), /Start Quiz/);
});

test("unknown files return 404 and unsupported methods return 405", async () => {
  const missing = await fetch(`${origin}/not-a-page`);
  assert.equal(missing.status, 404);

  const unsupported = await fetch(`${origin}/api/questions`, { method: "POST" });
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get("allow"), "GET, HEAD");
});
