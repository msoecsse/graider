# Review import fixtures

These files are shared contract fixtures for domain tests, Slice 2 preview tests
and the future Java Assignment Review Skill. All identities and SHAs are samples.

Use course `CS1021`, term `26s1`, assignment `lab4`, student `jdoe` /
`jane-doe`, repository `msoe-course/lab4-jane-doe`, and canonical SHA forty `a`
characters. Rubric `correctness` / `Correctness` has 10 possible points.

| Fixture                    | Trusted context / expected result                                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exact-match.json`         | `source-reviewed.java.txt` at canonical SHA; both findings ready                                                                                                                                          |
| `general-and-source.json`  | Same review demonstrates source-linked and uncategorized general findings                                                                                                                                 |
| `duplicate-reimport.json`  | Same IDs as exact-match; duplicate after provenance has been persisted                                                                                                                                    |
| `changed-recoverable.json` | Forty `b` SHA characters in canonical history; reviewed source is `source-reviewed.java.txt`, current source is `source-recovered.java.txt`; source anchor moves from line 2 to 3 with approval           |
| `changed-unresolved.json`  | Forty `c` SHA characters in history; reviewed source is `source-reviewed.java.txt`, current source is `source-unresolved.java.txt`; source finding blocked, general finding requires changed-SHA approval |
| `wrong-student.json`       | No roster match; unmatched                                                                                                                                                                                |
| `wrong-assignment.json`    | Wrong assignment slug; invalid                                                                                                                                                                            |
| `malformed-schema.json`    | String deduction; structurally invalid                                                                                                                                                                    |

The exact-match/general-and-source/duplicate files intentionally share review and
finding IDs. Real batches must not reuse one review ID for differing payloads.
