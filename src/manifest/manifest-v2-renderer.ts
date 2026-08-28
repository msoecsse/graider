import { stringify } from "yaml";
import {
  MANIFEST_V2_SCHEMA_VERSION,
  type ManifestRepositoryTarget,
  type ManifestStudentMapping
} from "./manifest-models.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

export const renderManifestV2Yaml = (input: {
  repositoryMode: "individual" | "group";
  targets: readonly ManifestRepositoryTarget[];
  studentMappings: readonly ManifestStudentMapping[];
  diagnostics?: readonly Diagnostic[];
}): string =>
  stringify(
    {
      schema_version: MANIFEST_V2_SCHEMA_VERSION,
      repository_mode: input.repositoryMode,
      targets: [...input.targets]
        .sort((a, b) => a.targetId.localeCompare(b.targetId))
        .map((target) => ({
          target_id: target.targetId,
          mode: target.mode,
          ...(target.groupId === undefined ? {} : { group_id: target.groupId }),
          repository_name: target.repositoryName,
          ...(target.htmlUrl === undefined ? {} : { html_url: target.htmlUrl }),
          ...(target.cloneUrl === undefined ? {} : { clone_url: target.cloneUrl }),
          section_ids: target.sectionIds,
          student_ids: target.studentIds,
          github_usernames: target.githubUsernames,
          diagnostics: target.diagnostics
        })),
      student_mappings: [...input.studentMappings]
        .sort((a, b) => a.studentId.localeCompare(b.studentId))
        .map((mapping) => ({
          student_id: mapping.studentId,
          github_username: mapping.githubUsername,
          target_id: mapping.targetId,
          repository_name: mapping.repositoryName,
          ...(mapping.htmlUrl === undefined ? {} : { html_url: mapping.htmlUrl }),
          ...(mapping.cloneUrl === undefined ? {} : { clone_url: mapping.cloneUrl })
        })),
      diagnostics: input.diagnostics ?? []
    },
    { indent: 2, lineWidth: 0 }
  );
