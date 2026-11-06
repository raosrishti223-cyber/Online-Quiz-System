function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required page element: #${id}`);
  }
  return element;
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, options);
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    const error = new Error(result.error ?? "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  return result;
}

function initializeAdmin() {
  const loginPanel = getElement("adminLoginPanel");
  const dashboard = getElement("adminDashboard");
  const loginForm = getElement("adminLoginForm");
  const loginMessage = getElement("loginMessage");
  const adminMessage = getElement("adminMessage");
  const questionForm = getElement("adminQuestionForm");
  const questionRows = getElement("questionRows");
  const emptyQuestions = getElement("emptyQuestions");
  const correctAnswer = getElement("correctAnswer");
  const questionFormTitle = getElement("questionFormTitle");
  const saveButton = getElement("saveQuestion");
  const cancelEditButton = getElement("cancelEdit");
  const questionListCount = getElement("questionListCount");
  let editingQuestionId = null;
  let questions = [];

  function showMessage(element, message, kind = "error") {
    element.textContent = message;
    element.dataset.kind = kind;
    element.hidden = false;
  }

  function clearMessage(element) {
    element.textContent = "";
    element.hidden = true;
  }

  function showDashboard() {
    loginPanel.hidden = true;
    dashboard.hidden = false;
  }

  function resetQuestionForm() {
    editingQuestionId = null;
    questionForm.reset();
    questionFormTitle.textContent = "Add a question";
    saveButton.textContent = "Add question";
    cancelEditButton.hidden = true;
    clearMessage(adminMessage);
  }

  function startEditing(question) {
    editingQuestionId = question.id;
    getElement("questionText").value = question.question;
    question.options.forEach((option, index) => {
      getElement(`option${index}`).value = option;
    });
    correctAnswer.value = String(question.correctAnswer);
    questionFormTitle.textContent = `Edit question ${question.id}`;
    saveButton.textContent = "Save changes";
    cancelEditButton.hidden = false;
    clearMessage(adminMessage);
    getElement("questionText").focus();
  }

  function renderQuestions() {
    questionRows.replaceChildren();
    questionListCount.textContent = String(questions.length);
    emptyQuestions.hidden = questions.length > 0;

    for (const question of questions) {
      const row = document.createElement("tr");
      const questionCell = document.createElement("td");
      questionCell.className = "question-cell";
      const questionText = document.createElement("span");
      questionText.textContent = question.question;
      const optionSummary = document.createElement("span");
      optionSummary.className = "option-summary";
      optionSummary.textContent = question.options.map((option, index) =>
        `${String.fromCharCode(65 + index)}. ${option}`).join(" · ");
      questionCell.append(questionText, optionSummary);

      const correctCell = document.createElement("td");
      correctCell.textContent = `Option ${String.fromCharCode(65 + question.correctAnswer)}`;

      const actionsCell = document.createElement("td");
      actionsCell.className = "question-actions";
      const editButton = document.createElement("button");
      editButton.className = "button button-secondary button-small";
      editButton.type = "button";
      editButton.textContent = "Edit";
      editButton.setAttribute("aria-label", `Edit question ${question.id}`);
      editButton.addEventListener("click", () => startEditing(question));

      const deleteButton = document.createElement("button");
      deleteButton.className = "button button-danger button-small";
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.setAttribute("aria-label", `Delete question ${question.id}`);
      deleteButton.addEventListener("click", () => {
        void deleteQuestion(question);
      });
      actionsCell.append(editButton, deleteButton);
      row.append(questionCell, correctCell, actionsCell);
      questionRows.append(row);
    }
  }

  async function loadQuestions() {
    questions = await requestJson("/api/admin/questions");
    renderQuestions();
  }

  async function deleteQuestion(question) {
    if (!window.confirm(`Delete “${question.question}”? This cannot be undone.`)) {
      return;
    }
    try {
      const result = await requestJson(`/api/admin/questions/${question.id}`, { method: "DELETE" });
      if (editingQuestionId === question.id) {
        resetQuestionForm();
      }
      await loadQuestions();
      showMessage(adminMessage, "Question deleted.", "success");
    } catch (error) {
      showMessage(adminMessage, error.message);
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(loginMessage);
    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      await requestJson("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: getElement("adminUsername").value,
          password: getElement("adminPassword").value
        })
      });
      loginForm.reset();
      showDashboard();
      await loadQuestions();
    } catch (error) {
      showMessage(loginMessage, error.message);
    } finally {
      submitButton.disabled = false;
    }
  });

  questionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(adminMessage);
    const question = {
      question: getElement("questionText").value.trim(),
      options: [0, 1, 2, 3].map((index) => getElement(`option${index}`).value.trim()),
      correctAnswer: Number(correctAnswer.value)
    };
    saveButton.disabled = true;
    try {
      const isEditing = editingQuestionId !== null;
      const path = isEditing
        ? `/api/admin/questions/${editingQuestionId}`
        : "/api/admin/questions";
      await requestJson(path, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(question)
      });
      resetQuestionForm();
      await loadQuestions();
      showMessage(adminMessage, isEditing ? "Question updated." : "Question added.", "success");
    } catch (error) {
      showMessage(adminMessage, error.message);
    } finally {
      saveButton.disabled = false;
    }
  });

  cancelEditButton.addEventListener("click", resetQuestionForm);
  getElement("adminLogout").addEventListener("click", async () => {
    try {
      await requestJson("/api/admin/logout", { method: "POST" });
      dashboard.hidden = true;
      loginPanel.hidden = false;
      resetQuestionForm();
      clearMessage(loginMessage);
    } catch (error) {
      showMessage(adminMessage, error.message);
    }
  });

  void requestJson("/api/admin/session")
    .then(async (session) => {
      if (!session.authenticated) {
        return;
      }
      showDashboard();
      await loadQuestions();
    })
    .catch((error) => {
      if (error.status !== 401) {
        showMessage(loginMessage, error.message);
      }
    });
}

if (document.body.dataset.page === "admin") {
  initializeAdmin();
}
