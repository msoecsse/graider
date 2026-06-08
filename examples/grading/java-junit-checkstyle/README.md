# Java / JUnit / CheckStyle Preset

Use this example when the assignment is a Java project that can be graded with
CheckStyle and JUnit Platform Console. The preset generates a local starter
workflow for the current Graider-supported preset:

```text
java-junit-checkstyle
```

Generate the workflow from a course-admin repository:

```bash
graider workflow generate terms/27s1/assignments/lab-java/assignment.yml
```

By default, Graider writes:

```text
terms/27s1/generated-workflows/lab-java/grade.yml
```

Review that file and copy it into the assignment template repository at:

```text
.github/workflows/grade.yml
```

The generated workflow includes `workflow_dispatch`, writes
`graider-output/grading-results.json`, and uploads the configured
`grading-results` artifact. `validate` checks that the configured workflow exists
locally and supports `workflow_dispatch`.

Student report publishing is a course-level setting. See
`course-reports-snippet.yml` for the matching `graider-generated` publishing
configuration.
