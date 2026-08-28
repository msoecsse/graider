# Graider RC1 Faculty Smoke Test

Use only a safe sandbox course for mutating steps. Confirm Apply and Confirm
Grade Dispatch may modify GitHub/course state or start GitHub Actions.

- [ ] Launch Graider.
- [ ] Confirm the GitHub auth check shows Connected.
- [ ] Open a course repository folder.
- [ ] Confirm the dashboard auto-loads.
- [ ] Open assignment detail.
- [ ] Confirm Apply Preview works.
- [ ] Confirm Apply works on the sandbox course.
- [ ] Confirm Grade Dispatch Preview works.
- [ ] Confirm Grade Dispatch works on the sandbox course.
- [ ] Confirm Grade Status updates.
- [ ] Confirm Faculty Report renders.
- [ ] Quit and relaunch Graider.
- [ ] Confirm the cached course auto-loads.
- [ ] Confirm GitHub run links open when the browser is signed into GitHub.

If a private GitHub link opens as a 404 page, sign into GitHub in the browser
with the same account used for `gh auth login`.
