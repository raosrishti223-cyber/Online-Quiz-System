const ATTEMPT_KEY = "onlineQuizSprint1Attempt";
const RESULT_KEY = "onlineQuizSprint1Result";
const optionLetters = ["A", "B", "C", "D"];

function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required page element: #${id}`);
  }
  return element;
}

function readAttempt(questionSet) {
  const saved = sessionStorage.getItem(ATTEMPT_KEY);
  if (!saved) {
    return { currentIndex: 0, answers: {} };
  }

  try {
    const attempt = JSON.parse(saved);
    if (!attempt || typeof attempt !== "object") {
      throw new Error("Saved quiz attempt is not an object.");
    }

    const answers = {};
    for (const question of questionSet) {
      const answer = attempt.answers?.[question.id];
      if (Number.isInteger(answer) && answer >= 0 && answer < question.options.length) {
        answers[question.id] = answer;
      }
    }

    const currentIndex = Number.isInteger(attempt.currentIndex)
      ? Math.min(Math.max(attempt.currentIndex, 0), questionSet.length - 1)
      : 0;
    return { currentIndex, answers };
  } catch (error) {
    console.error("Could not restore the saved quiz attempt:", error);
    sessionStorage.removeItem(ATTEMPT_KEY);
    return { currentIndex: 0, answers: {} };
  }
}

function initializeQuiz() {
  const answerProgress = getElement("answerProgress");
  const answerGroup = getElement("answerGroup");
  const answerList = getElement("answerList");
  const loadError = getElement("loadError");
  const questionCount = getElement("questionCount");
  const questionLegend = getElement("questionLegend");
  const questionIndex = getElement("questionIndex");
  const previousButton = getElement("previousQuestion");
  const nextButton = getElement("nextQuestion");
  const submitButton = getElement("submitQuiz");
  const progressBar = getElement("questionProgress");
  const progressFill = getElement("progressFill");
  const submitDialog = getElement("submitDialog");
  const exitDialog = getElement("exitDialog");
  let questions = [];
  let currentIndex = 0;
  let answers = {};

  function persistAttempt() {
    sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ currentIndex, answers }));
  }

  function renderQuestion() {
    const question = questions[currentIndex];
    questionCount.textContent = `Question ${currentIndex + 1} of ${questions.length}`;
    questionLegend.textContent = question.question;
    answerList.replaceChildren();

    question.options.forEach((option, optionIndex) => {
      const optionId = `question-${question.id}-option-${optionIndex}`;
      const wrapper = document.createElement("div");
      wrapper.className = "answer-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `question-${question.id}`;
      input.id = optionId;
      input.value = String(optionIndex);
      input.checked = answers[question.id] === optionIndex;
      input.addEventListener("change", () => {
        answers[question.id] = optionIndex;
        persistAttempt();
        renderProgress();
        renderQuestionIndex();
      });

      const label = document.createElement("label");
      label.htmlFor = optionId;
      const letter = document.createElement("span");
      letter.className = "answer-letter";
      letter.setAttribute("aria-hidden", "true");
      letter.textContent = optionLetters[optionIndex];
      const text = document.createElement("span");
      text.textContent = option;
      label.append(letter, text);
      wrapper.append(input, label);
      answerList.append(wrapper);
    });

    previousButton.disabled = currentIndex === 0;
    nextButton.disabled = currentIndex === questions.length - 1;
    submitButton.disabled = questions.length === 0;
    persistAttempt();
    renderProgress();
    renderQuestionIndex();
  }

  function renderProgress() {
    const answeredCount = Object.keys(answers).length;
    answerProgress.textContent = `${answeredCount} of ${questions.length} answered`;
    const progress = Math.round(((currentIndex + 1) / questions.length) * 100);
    progressBar.setAttribute("aria-valuenow", String(progress));
    progressFill.style.width = `${progress}%`;
  }

  function renderQuestionIndex() {
    questionIndex.replaceChildren();
    questions.forEach((question, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "index-button";
      button.textContent = String(index + 1);
      button.setAttribute("aria-label", `Go to question ${index + 1}${answers[question.id] === undefined ? ", unanswered" : ", answered"}`);
      if (answers[question.id] !== undefined) {
        button.classList.add("is-answered");
      }
      if (index === currentIndex) {
        button.setAttribute("aria-current", "step");
      }
      button.addEventListener("click", () => {
        currentIndex = index;
        renderQuestion();
      });
      questionIndex.append(button);
    });
  }

  function openSubmitDialog() {
    const unanswered = questions.length - Object.keys(answers).length;
    const dialogMessage = getElement("dialogMessage");
    const dialogTitle = getElement("dialogTitle");
    const confirmButton = getElement("confirmSubmit");

    if (unanswered > 0) {
      dialogTitle.textContent = "Some questions are unanswered";
      dialogMessage.textContent = `You still have ${unanswered} unanswered ${unanswered === 1 ? "question" : "questions"}. You can review them or submit your answers as they are.`;
      confirmButton.textContent = "Submit anyway";
    } else {
      dialogTitle.textContent = "Ready to submit?";
      dialogMessage.textContent = "You have answered every question. Once submitted, your answers cannot be changed.";
      confirmButton.textContent = "Submit quiz";
    }
    submitDialog.showModal();
  }

  previousButton.addEventListener("click", () => {
    if (currentIndex > 0) {
      currentIndex -= 1;
      renderQuestion();
    }
  });

  nextButton.addEventListener("click", () => {
    if (currentIndex < questions.length - 1) {
      currentIndex += 1;
      renderQuestion();
    }
  });

  submitButton.addEventListener("click", openSubmitDialog);
  getElement("cancelSubmit").addEventListener("click", () => submitDialog.close());
  getElement("confirmSubmit").addEventListener("click", () => {
    const answeredCount = Object.keys(answers).length;
    sessionStorage.setItem(RESULT_KEY, JSON.stringify({
      total: questions.length,
      answered: answeredCount,
      unanswered: questions.length - answeredCount
    }));
    sessionStorage.removeItem(ATTEMPT_KEY);
    window.location.assign("result.html");
  });

  getElement("exitQuiz").addEventListener("click", () => exitDialog.showModal());
  getElement("cancelExit").addEventListener("click", () => exitDialog.close());
  getElement("confirmExit").addEventListener("click", () => {
    sessionStorage.removeItem(ATTEMPT_KEY);
    sessionStorage.removeItem(RESULT_KEY);
    window.location.assign("index.html");
  });

  async function loadQuestions() {
    try {
      const response = await fetch("/api/questions");
      if (!response.ok) {
        throw new Error(`The question service returned ${response.status}.`);
      }
      const questionSet = await response.json();
      if (!Array.isArray(questionSet) || questionSet.length === 0) {
        throw new Error("No quiz questions are currently available.");
      }

      questions = questionSet;
      if (new URLSearchParams(window.location.search).has("new")) {
        sessionStorage.removeItem(ATTEMPT_KEY);
        sessionStorage.removeItem(RESULT_KEY);
        const pageUrl = new URL(window.location.href);
        pageUrl.searchParams.delete("new");
        window.history.replaceState(null, "", pageUrl);
      }
      ({ currentIndex, answers } = readAttempt(questions));
      answerGroup.disabled = false;
      renderQuestion();
    } catch (error) {
      console.error("Could not load quiz questions:", error);
      answerGroup.hidden = true;
      loadError.hidden = false;
      loadError.textContent = "Questions could not be loaded. Check that the local server is running, then try again.";
      answerProgress.textContent = "Questions unavailable";
      previousButton.disabled = true;
      nextButton.disabled = true;
      submitButton.disabled = true;
    }
  }

  void loadQuestions();
}

function initializeResult() {
  const rawResult = sessionStorage.getItem(RESULT_KEY);
  const description = getElement("resultDescription");
  const counts = getElement("resultCounts");
  const scopeNote = getElement("scopeNote");

  getElement("returnHome").addEventListener("click", () => {
    sessionStorage.removeItem(RESULT_KEY);
  });

  if (!rawResult) {
    description.textContent = "There is no submitted quiz in this browser tab yet. Start a quiz whenever you are ready.";
    return;
  }

  try {
    const result = JSON.parse(rawResult);
    if (!Number.isInteger(result.total) || !Number.isInteger(result.answered) || !Number.isInteger(result.unanswered)) {
      throw new Error("The saved quiz submission is incomplete.");
    }
    description.textContent = "Your quiz submission has been recorded for this demo.";
    getElement("answeredCount").textContent = String(result.answered);
    getElement("unansweredCount").textContent = String(result.unanswered);
    counts.hidden = false;
    scopeNote.hidden = false;
  } catch (error) {
    console.error("Could not display the quiz submission:", error);
    description.textContent = "The saved submission could not be displayed. Return home to start a new quiz.";
  }
}

if (document.body.dataset.page === "quiz") {
  initializeQuiz();
} else if (document.body.dataset.page === "result") {
  initializeResult();
}
