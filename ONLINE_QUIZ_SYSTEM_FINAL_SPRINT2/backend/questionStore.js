import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getQuestions, isValidQuestionSet } from "./db.js";

const defaultDataFile = resolve(fileURLToPath(new URL("./data/questions.json", import.meta.url)));

function copyQuestions(questionSet) {
  return questionSet.map((question) => ({
    ...question,
    options: [...question.options]
  }));
}

export function createQuestionStore(dataFile = defaultDataFile) {
  let questions;
  let initialization;
  let mutationQueue = Promise.resolve();

  async function persist(questionSet) {
    await mkdir(dirname(dataFile), { recursive: true });
    const temporaryFile = `${dataFile}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryFile, `${JSON.stringify(questionSet, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx"
      });
      await rename(temporaryFile, dataFile);
    } catch (error) {
      try {
        await rm(temporaryFile, { force: true });
      } catch (cleanupError) {
        console.error("Could not remove a temporary question data file:", cleanupError);
      }
      throw error;
    }
  }

  async function initialize() {
    if (questions) {
      return;
    }
    if (!initialization) {
      initialization = (async () => {
        await mkdir(dirname(dataFile), { recursive: true });
        try {
          const contents = await readFile(dataFile, "utf8");
          const storedQuestions = JSON.parse(contents);
          if (!isValidQuestionSet(storedQuestions) || storedQuestions.length === 0) {
            throw new Error("Stored question data is invalid.");
          }
          questions = copyQuestions(storedQuestions);
        } catch (error) {
          if (error.code !== "ENOENT") {
            throw error;
          }
          const seedQuestions = getQuestions();
          await persist(seedQuestions);
          questions = seedQuestions;
        }
      })();
    }
    await initialization;
  }

  async function mutate(mutator) {
    await initialize();
    const operation = mutationQueue.then(async () => {
      const nextQuestions = copyQuestions(questions);
      const result = mutator(nextQuestions);
      await persist(nextQuestions);
      questions = nextQuestions;
      return result;
    });
    mutationQueue = operation.catch(() => {});
    return operation;
  }

  return {
    async getAll() {
      await initialize();
      await mutationQueue;
      return copyQuestions(questions);
    },

    async add(question) {
      return mutate((questionSet) => {
        const id = questionSet.reduce((largest, item) => Math.max(largest, item.id), 0) + 1;
        const created = { id, ...question, options: [...question.options] };
        questionSet.push(created);
        return { ...created, options: [...created.options] };
      });
    },

    async update(id, question) {
      return mutate((questionSet) => {
        const index = questionSet.findIndex((item) => item.id === id);
        if (index === -1) {
          return null;
        }
        questionSet[index] = { id, ...question, options: [...question.options] };
        return { ...questionSet[index], options: [...questionSet[index].options] };
      });
    },

    async remove(id) {
      return mutate((questionSet) => {
        const index = questionSet.findIndex((item) => item.id === id);
        if (index === -1) {
          return { removed: false, remaining: questionSet.length };
        }
        if (questionSet.length === 1) {
          return { removed: false, remaining: 1, reason: "last-question" };
        }
        questionSet.splice(index, 1);
        return { removed: true, remaining: questionSet.length };
      });
    }
  };
}
