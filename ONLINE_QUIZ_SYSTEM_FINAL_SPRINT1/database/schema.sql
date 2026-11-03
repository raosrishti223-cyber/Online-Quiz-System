CREATE DATABASE IF NOT EXISTS online_quiz;
USE online_quiz;

CREATE TABLE IF NOT EXISTS questions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  question TEXT NOT NULL,
  options JSON NOT NULL,
  correct_answer TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_questions_four_options
    CHECK (JSON_TYPE(options) = 'ARRAY' AND JSON_LENGTH(options) = 4),
  CONSTRAINT chk_questions_correct_answer
    CHECK (correct_answer BETWEEN 0 AND 3)
);
