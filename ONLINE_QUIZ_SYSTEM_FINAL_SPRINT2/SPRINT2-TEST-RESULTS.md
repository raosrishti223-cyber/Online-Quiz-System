# Sprint 2 test execution record

Executed locally on Node.js 24.9.0 with the built-in Node.js test runner. Automated tests use a temporary question data file and a local HTTP server; test question edits do not change the demo's persistent question data.

## Issue test cases

| Issue | Test case | Expected result | Actual result | Status |
|---|---|---|---|---|
| #15 TEST-01 | Submit correct, incorrect, and unanswered choices; submit an invalid index, duplicate answer, and unknown question ID. | Score categories total the question count; invalid/duplicate/unknown answers are rejected; unanswered items are reported. | 1 correct, 1 incorrect, 3 unanswered out of 5 (20%); invalid submissions returned HTTP 400. Browser showed the unanswered warning and allowed review or confirmation. | PASS |
| #16 TEST-02 | Request admin questions before login, try an incorrect login, sign in with configured credentials, then sign out. | Unauthorized requests are rejected; valid login receives an HttpOnly, SameSite=Strict cookie; logout revokes access. | Unauthenticated access and wrong credentials returned HTTP 401; cross-origin login returned HTTP 403; valid login worked; post-logout access returned HTTP 401. | PASS |
| #17 TEST-03 | Add a valid question, reject incomplete options, edit the question, view it, delete it, and try deleting the last remaining question. | Valid CRUD changes persist; incomplete questions are rejected; a quiz cannot be left with zero questions. | Add returned HTTP 201; invalid input returned HTTP 400; edit and delete succeeded; reload retained data; deleting the final question returned HTTP 409. | PASS |
| #18 TEST-04 | Check a correct answer, an incorrect answer, and no answer; reload the question store. | Server-calculated score and counts match the stored answer key; saved question changes remain available after store recreation. | Automated score checks passed; browser displayed 20%, 1 correct, 1 incorrect, 3 unanswered, and 5 total; persistence checks passed. | PASS |
| #19 TEST-05 | Send malformed JSON, missing answers, the wrong content type, an unsupported method, and an unknown page. | The API returns clear client errors and the server handles missing routes without crashing. | Returned HTTP 400, 415, 405, and 404 respectively with error messages; test server remained available. | PASS |
| #20 TEST-06 | Use the quiz and admin pages in a browser: choose answers, navigate, submit with unanswered questions, log in, and use question forms. | Controls are labelled, selected answers persist during navigation, confirmations/messages are understandable, and admin actions are usable. | Browser smoke test passed; selected answer was retained, submit warning appeared, invalid login showed an error, and add/edit/delete updated the visible list. | PASS |
| #21 TEST-07 | Make 25 sequential local requests to the public question API. | Every request succeeds and total local response time stays below the 2,500 ms test threshold. | All 25 requests succeeded in 48.4 ms in the final clean-install run. | PASS |

## Automated suite

Run `npm.cmd test`. All 11 automated tests passed in the final clean-install run. The suite covers the question format, public answer-key privacy, score/answer validation, authentication and session revocation, question CRUD and input validation, persistence, error handling, and response performance. The browser smoke test additionally covered the visible quiz-result and administrator workflows.

The result is a local development/demo validation, not a production load test or a substitute for repository-owner review.
