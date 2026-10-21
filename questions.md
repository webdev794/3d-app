# Open questions

Questions waiting for your answer. Each one is also asked in the chat; once answered, it is removed from here. My suggested answer is in brackets under each question.

1. **Airwallex demo details (asked to the client 2026-10-21):** from the client's Airwallex **demo** (sandbox) account, Settings > Developer > API keys: the **Client ID** and an **API key**. Once they add the webhook for the test site (the address and events are in Requirements.md, section 3), also its **webhook secret**. Please send them to me privately, not in this file or any notes file (these go to GitHub); they go only into the test site's settings (.env).
   (Client sends them privately; they go into .env only.)

2. **Remove 31 test accounts from the local database? (2026-10-21)** Testing scripts signed up on the local site (127.0.0.1:8000) since 2026-10-16 and left 31 test accounts (layout.qa…, gradient.qa…, hoodie.qa…, cdr.qa…@example.com) with one test project each in database.sqlite. That database goes into the live packages, so they are on the live site too. The scripts are fixed to use a separate test copy from now on. If yes, I back up database.sqlite, delete only those accounts and their projects, check that admin@3deezi.com and admin@example.test are still there, and make a new live package.
   (Yes: back up, then delete only those 31 accounts and their projects.)
