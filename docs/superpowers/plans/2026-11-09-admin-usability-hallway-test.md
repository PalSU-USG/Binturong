# Hallway test: admin usability

For the owner to run with one real, non-technical USG staff member (about 20 minutes). The
aim is to find what confuses a person, not to test the person. Any task they cannot finish
alone is a defect in the admin, not a training gap.

## Before you start

- Use the guarded test environment or a staging copy, never real published content.
- Create two accounts: an editor (the participant) and a publisher (you).
- Have a small sample PDF ready (not a real record).
- Do not explain screens or point. If they ask what a word means, write it down and ask what they think it means.

## Script

Say: "Imagine you work in the USG office. I will ask you to do four things. Think out loud. I can't help, but I will take notes."

1. Post a notice. "Post a short notice: the library will be closed on Friday."
   Done when a saved draft exists and the participant says a publisher still has to publish it.
   Watch: finding the starting point; the headline and text boxes; "Save Draft"; the sentence "A publisher will review and publish this."
2. Upload a report. "Add a financial report using this PDF."
   Done when the PDF shows Ready under Official documents and a draft report points to it.
   Watch: whether "Upload a report" leads to the right place; the two steps (upload the file, then add the report); the words "Upload status".
3. Check what is waiting (switch to the publisher account). "Find what is waiting for you and make the notice live."
   Done when the notice is visible on the public site.
   Watch: the "Waiting for a publisher" list; finding the Publish button.
4. Fix a mistake (editor account). "The Friday date was wrong. Change it to Monday."
   Done when a new draft change is saved and they know it is not live yet.

## Record per task

| Question | Note |
| --- | --- |
| Finished unaided? (yes / yes after a hint / no) | |
| Time taken | |
| Words or screens they hesitated at | |
| Wrong clicks | |
| Their own words for what they were trying to do | |

## Pass rule

All four tasks finished unaided. Anything else becomes a fix: change the label, help text or
screen, rerun the jargon test, and repeat with a different person.

## After the session

Ask "What was the most confusing word or screen?" and "What would you have asked a developer
about?" Record the answers verbatim in `plans/admin-usability.md`.
