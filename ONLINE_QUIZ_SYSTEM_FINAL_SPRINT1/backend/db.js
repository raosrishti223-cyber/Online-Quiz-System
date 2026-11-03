export const questions = [
  {
    id: 1,
    question: "What does HTML stand for?",
    options: [
      "Hyper Text Markup Language",
      "High Text Machine Language",
      "Hyper Transfer Markup Language",
      "Home Tool Markup Language"
    ],
    correctAnswer: 0
  },
  {
    id: 2,
    question: "Which language is used to add interactivity to a web page?",
    options: ["HTML", "CSS", "JavaScript", "SQL"],
    correctAnswer: 2
  },
  {
    id: 3,
    question: "Which CSS property changes the text color?",
    options: ["font-style", "color", "background-image", "text-align"],
    correctAnswer: 1
  },
  {
    id: 4,
    question: "Which HTML element creates a hyperlink?",
    options: ["<link>", "<a>", "<href>", "<url>"],
    correctAnswer: 1
  },
  {
    id: 5,
    question: "Which HTTP method is commonly used to retrieve data?",
    options: ["POST", "DELETE", "GET", "PATCH"],
    correctAnswer: 2
  }
];

export function getQuestions() {
  return questions.map((question) => ({
    ...question,
    options: [...question.options]
  }));
}

export function isValidQuestionSet(questionSet) {
  return Array.isArray(questionSet) && questionSet.every((question) =>
    Number.isInteger(question.id)
    && typeof question.question === "string"
    && question.question.trim().length > 0
    && Array.isArray(question.options)
    && question.options.length === 4
    && question.options.every((option) => typeof option === "string" && option.trim().length > 0)
    && Number.isInteger(question.correctAnswer)
    && question.correctAnswer >= 0
    && question.correctAnswer < question.options.length
  );
}
