import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement
} from "react";
import type {
  CourseFolderRecord,
  RosterLoadResult,
  RosterPreviewResult,
  RosterRemoveRequest,
  RosterRow,
  RosterSaveRequest,
  RosterSectionSummary,
  RosterSource,
  RosterSourceKind
} from "../../electron/ipc";
import {
  diffRosterRows,
  parseAndValidateRosterCsv,
  type RosterRowDiff
} from "../../../src/roster/roster-shared";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { OverflowMenu, type OverflowMenuGroup } from "../components/OverflowMenu";
import { PageHeader } from "../components/PageHeader";
import { TechnicalDetails } from "../components/TechnicalDetails";
import { Toast, useToast } from "../components/Toast";
import { UnsavedChangesBar } from "../components/UnsavedChangesBar";
import { RosterSaveReview } from "./RosterSaveReview";
import { RosterSectionTabs } from "./RosterSectionTabs";
import { RosterFacultyPanel, RosterStatsCard } from "./RosterSidebar";
import { RosterSourceBar } from "./RosterSourceBar";
import { RosterStudentTable } from "./RosterStudentTable";
import { diffFaculty, getUnsavedMessage, type RosterDraftRow } from "./rosterManagerModel";

type LoadState = "idle" | "loading" | "ready" | "invalid";
type DestructiveAction = "clear" | "remove_roster" | "remove_section";
type PendingNavigation =
  | { readonly type: "section"; readonly sectionId: string }
  | { readonly type: "new_section" };

const emptyRow = (section: string): RosterRow => ({
  studentId: "",
  githubUsername: "",
  section,
  status: "active"
});

const getDiagnosticsMessage = (
  diagnostics: readonly { readonly message: string }[]
): string | null => diagnostics.map((item) => item.message).join(" ") || null;

const getDestructiveDialogCopy = (
  action: DestructiveAction,
  sectionId: string
): { readonly title: string; readonly summary: string; readonly confirmLabel: string } => {
  if (action === "clear") {
    return {
      title: "Clear roster rows",
      summary: `This stages an empty roster for section ${sectionId}. Nothing is saved until you review and save. Student repositories and published reports are not deleted.`,
      confirmLabel: "Clear roster rows"
    };
  }
  if (action === "remove_roster") {
    return {
      title: "Remove roster",
      summary: `This removes section ${sectionId} from the term configuration and deletes its roster files. Student repositories and published reports are not deleted.`,
      confirmLabel: "Remove roster"
    };
  }
  return {
    title: "Remove section",
    summary: `This removes section ${sectionId} from the term configuration and deletes its roster files if present. Student repositories and published reports are not deleted.`,
    confirmLabel: "Remove section"
  };
};

export interface RosterManagerPageProps {
  readonly courseFolder: CourseFolderRecord;
  readonly termCode: string;
  readonly courseTitle: string;
  readonly termTitle: string;
  readonly onSaved: () => void;
}

export const RosterManagerPage = ({
  courseFolder,
  termCode,
  courseTitle,
  termTitle,
  onSaved
}: RosterManagerPageProps): ReactElement => {
  const [sections, setSections] = useState<readonly string[]>([]);
  const [summaries, setSummaries] = useState<ReadonlyMap<string, RosterSectionSummary>>(new Map());
  const [sectionId, setSectionId] = useState("");
  const [isCreatingSection, setIsCreatingSection] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [isExisting, setIsExisting] = useState(false);
  const [draftRows, setDraftRows] = useState<readonly RosterDraftRow[]>([]);
  const [baselineRows, setBaselineRows] = useState<readonly RosterRow[]>([]);
  const [faculty, setFaculty] = useState<readonly string[]>([]);
  const [baselineFaculty, setBaselineFaculty] = useState<readonly string[]>([]);
  const [loadedSource, setLoadedSource] = useState<RosterSource>();
  const [pendingSourceKind, setPendingSourceKind] = useState<RosterSourceKind>();
  const [rosterPath, setRosterPath] = useState<string | null>(null);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);
  const [publicationWarning, setPublicationWarning] = useState<string | null>(null);
  const [preview, setPreview] = useState<RosterPreviewResult | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [destructiveAction, setDestructiveAction] = useState<DestructiveAction | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const { message: toastMessage, showToast } = useToast();
  const rowKeySequence = useRef(0);
  const loadGeneration = useRef(0);
  const summaryGeneration = useRef(0);
  const termsGeneration = useRef(0);
  const sectionBeforeNew = useRef<string | null>(null);

  const createDraftRows = useCallback(
    (loadedRows: readonly RosterRow[]): readonly RosterDraftRow[] =>
      loadedRows.map((row) => {
        rowKeySequence.current += 1;
        return { key: `roster-row-${String(rowKeySequence.current)}`, row: { ...row } };
      }),
    []
  );

  const rows = useMemo(() => draftRows.map((draftRow) => draftRow.row), [draftRows]);
  const rosterDiff = useMemo(() => diffRosterRows(baselineRows, rows), [baselineRows, rows]);
  const facultyDiff = useMemo(
    () => diffFaculty(baselineFaculty, faculty),
    [baselineFaculty, faculty]
  );
  const effectivePendingSourceKind =
    isCreatingSection || rosterDiff.totalChangeCount > 0 ? pendingSourceKind : undefined;
  const newSectionDirty =
    isCreatingSection && (sectionId.trim().length > 0 || rows.length > 0 || faculty.length > 0);
  const isDirty =
    loadState !== "invalid" &&
    (newSectionDirty || rosterDiff.totalChangeCount > 0 || facultyDiff.changed);
  const removedDiffs = rosterDiff.rows.filter((row) => row.changeType === "dropped");

  const clearReview = (): void => {
    setPreview(null);
    setIsReviewOpen(false);
  };

  const refreshSummaries = useCallback(async (): Promise<void> => {
    const getRosterSectionSummaries = window.graiderUI.getRosterSectionSummaries;
    const generation = summaryGeneration.current + 1;
    summaryGeneration.current = generation;
    if (getRosterSectionSummaries === undefined) {
      setDiagnosticMessage("Roster section summaries are unavailable in this app build.");
    } else {
      try {
        const result = await getRosterSectionSummaries({
          courseFolderId: courseFolder.id,
          courseFolderPath: courseFolder.path,
          termCode
        });
        if (summaryGeneration.current === generation) {
          setSummaries(
            new Map(result.summaries.map((summary) => [summary.sectionId, summary] as const))
          );
          if (result.status === "term_config_error") {
            setDiagnosticMessage(getDiagnosticsMessage(result.diagnostics));
          }
        }
      } catch {
        if (summaryGeneration.current === generation) {
          setDiagnosticMessage("Unable to load roster section summaries.");
        }
      }
    }
  }, [courseFolder.id, courseFolder.path, termCode]);

  const applyLoadedSection = useCallback(
    (result: RosterLoadResult): void => {
      const loadedRows = result.rows.map((row) => ({ ...row }));
      const loadedFaculty = [...(result.faculty ?? [])];
      setBaselineRows(loadedRows);
      setDraftRows(createDraftRows(loadedRows));
      setBaselineFaculty(loadedFaculty);
      setFaculty(loadedFaculty);
      setIsExisting(result.exists);
      setLoadedSource(result.source);
      setPendingSourceKind(undefined);
      setRosterPath(result.path);
      setLoadState(result.status === "ready" ? "ready" : "invalid");
      setDiagnosticMessage(getDiagnosticsMessage(result.diagnostics));
      setPublicationWarning(null);
      clearReview();
    },
    [createDraftRows]
  );

  const loadSection = useCallback(
    async (nextSectionId: string): Promise<void> => {
      const generation = loadGeneration.current + 1;
      loadGeneration.current = generation;
      setSectionId(nextSectionId);
      setIsCreatingSection(false);
      setLoadState("loading");
      setDiagnosticMessage(null);
      setPublicationWarning(null);
      setBaselineRows([]);
      setDraftRows([]);
      setBaselineFaculty([]);
      setFaculty([]);
      setLoadedSource(undefined);
      setPendingSourceKind(undefined);
      setRosterPath(null);
      clearReview();

      const getRosterForSection = window.graiderUI.getRosterForSection;
      if (getRosterForSection === undefined) {
        setLoadState("invalid");
        setDiagnosticMessage("Roster management is unavailable in this app build.");
      } else {
        try {
          const result = await getRosterForSection({
            courseFolderId: courseFolder.id,
            courseFolderPath: courseFolder.path,
            termCode,
            sectionId: nextSectionId
          });
          if (loadGeneration.current === generation) applyLoadedSection(result);
        } catch {
          if (loadGeneration.current === generation) {
            setLoadState("invalid");
            setDiagnosticMessage("Unable to load this roster.");
          }
        }
      }
    },
    [applyLoadedSection, courseFolder.id, courseFolder.path, termCode]
  );

  useEffect(() => {
    const generation = termsGeneration.current + 1;
    termsGeneration.current = generation;
    loadGeneration.current += 1;
    setSections([]);
    setSectionId("");
    setIsCreatingSection(false);
    setLoadState("idle");
    setBaselineRows([]);
    setDraftRows([]);
    setBaselineFaculty([]);
    setFaculty([]);
    setLoadedSource(undefined);
    setPendingSourceKind(undefined);
    setRosterPath(null);
    setDiagnosticMessage(null);
    clearReview();

    const loadRosterTerms = window.graiderUI.loadRosterTerms;
    if (loadRosterTerms === undefined) {
      setDiagnosticMessage("Roster management is unavailable in this app build.");
    } else {
      void loadRosterTerms({
        courseFolderId: courseFolder.id,
        courseFolderPath: courseFolder.path
      })
        .then((result) => {
          if (termsGeneration.current !== generation) return;
          const routedTerm = result.terms.find((term) => term.code === termCode);
          if (routedTerm === undefined) {
            setDiagnosticMessage(`The routed term ${termCode} is not configured for this course.`);
            return;
          }
          setSections(routedTerm.sections);
          const termsMessage = getDiagnosticsMessage(result.diagnostics);
          if (termsMessage !== null) setDiagnosticMessage(termsMessage);
          const firstSection = routedTerm.sections[0];
          if (firstSection !== undefined) void loadSection(firstSection);
        })
        .catch(() => {
          if (termsGeneration.current === generation) {
            setDiagnosticMessage("Unable to load terms for this course.");
          }
        });
    }
    void refreshSummaries();
  }, [courseFolder.id, courseFolder.path, loadSection, refreshSummaries, termCode]);

  const startNewSection = (): void => {
    loadGeneration.current += 1;
    sectionBeforeNew.current = sectionId.length === 0 ? null : sectionId;
    setSectionId("");
    setIsCreatingSection(true);
    setLoadState("ready");
    setIsExisting(false);
    setBaselineRows([]);
    setDraftRows([]);
    setBaselineFaculty([]);
    setFaculty([]);
    setLoadedSource(undefined);
    setPendingSourceKind("manual_edit");
    setRosterPath(null);
    setDiagnosticMessage(null);
    setPublicationWarning(null);
    clearReview();
  };

  const performNavigation = (navigation: PendingNavigation): void => {
    if (navigation.type === "new_section") startNewSection();
    else void loadSection(navigation.sectionId);
  };

  const requestNavigation = (navigation: PendingNavigation): void => {
    if (isDirty) {
      setPendingNavigation(navigation);
      setIsDiscardDialogOpen(true);
    } else {
      performNavigation(navigation);
    }
  };

  const discardDraft = (): void => {
    clearReview();
    setDiagnosticMessage(null);
    setPublicationWarning(null);
    if (isCreatingSection) {
      const previousSection = sectionBeforeNew.current;
      setIsCreatingSection(false);
      setSectionId("");
      setBaselineRows([]);
      setDraftRows([]);
      setBaselineFaculty([]);
      setFaculty([]);
      setPendingSourceKind(undefined);
      setLoadedSource(undefined);
      setRosterPath(null);
      setLoadState("idle");
      if (previousSection !== null) void loadSection(previousSection);
    } else {
      setDraftRows(createDraftRows(baselineRows));
      setFaculty([...baselineFaculty]);
      setPendingSourceKind(undefined);
    }
  };

  const markStudentEdit = (): void => {
    setPendingSourceKind("manual_edit");
    clearReview();
  };

  const updateRow = (key: string, field: "studentId" | "githubUsername", value: string): void => {
    setDraftRows((current) =>
      current.map((draftRow) =>
        draftRow.key === key ? { ...draftRow, row: { ...draftRow.row, [field]: value } } : draftRow
      )
    );
    markStudentEdit();
  };

  const setRowStatus = (key: string, status: "active" | "hold" | "dropped"): void => {
    setDraftRows((current) =>
      current.map((draftRow) =>
        draftRow.key === key ? { ...draftRow, row: { ...draftRow.row, status } } : draftRow
      )
    );
    markStudentEdit();
  };

  const addStudent = (): void => {
    rowKeySequence.current += 1;
    setDraftRows((current) => [
      ...current,
      { key: `roster-row-${String(rowKeySequence.current)}`, row: emptyRow(sectionId) }
    ]);
    markStudentEdit();
  };

  const removeStudent = (key: string): void => {
    setDraftRows((current) => current.filter((draftRow) => draftRow.key !== key));
    markStudentEdit();
  };

  const undoRemove = (diff: RosterRowDiff): void => {
    const baseline = diff.baseline;
    if (baseline !== null) {
      rowKeySequence.current += 1;
      setDraftRows((current) => [
        ...current,
        {
          key: `roster-row-${String(rowKeySequence.current)}`,
          row: { ...baseline }
        }
      ]);
      markStudentEdit();
    }
  };

  const addFaculty = (username: string): void => {
    setFaculty((current) =>
      current.some((value) => value.toLowerCase() === username.toLowerCase())
        ? current
        : [...current, username]
    );
    if (!isExisting && loadedSource === undefined) setPendingSourceKind("manual_edit");
    clearReview();
  };

  const removeFaculty = (username: string): void => {
    setFaculty((current) => current.filter((value) => value !== username));
    if (!isExisting && loadedSource === undefined) setPendingSourceKind("manual_edit");
    clearReview();
  };

  const replaceFromCsv = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file !== undefined) {
      void file
        .text()
        .then((content) => {
          const result = parseAndValidateRosterCsv({
            content,
            rosterPath: "uploaded roster",
            expectedSection: sectionId
          });
          if (result.errors.length > 0) {
            setDiagnosticMessage(getDiagnosticsMessage(result.errors));
          } else {
            setDraftRows(createDraftRows(result.records));
            setPendingSourceKind("csv_upload");
            setDiagnosticMessage(getDiagnosticsMessage(result.warnings));
            clearReview();
          }
        })
        .catch(() => setDiagnosticMessage("Unable to read the selected CSV file."))
        .finally(() => {
          input.value = "";
        });
    }
  };

  const request = useMemo<RosterSaveRequest>(
    () => ({
      courseFolderId: courseFolder.id,
      courseFolderPath: courseFolder.path,
      termCode,
      sectionId,
      rows,
      faculty,
      createSection: isCreatingSection,
      ...(effectivePendingSourceKind === undefined
        ? {}
        : { sourceKind: effectivePendingSourceKind }),
      confirmed: false
    }),
    [
      courseFolder.id,
      courseFolder.path,
      faculty,
      isCreatingSection,
      effectivePendingSourceKind,
      rows,
      sectionId,
      termCode
    ]
  );

  const handlePreview = async (): Promise<void> => {
    const previewRosterSave = window.graiderUI.previewRosterSave;
    if (previewRosterSave === undefined) {
      setDiagnosticMessage("Roster save preview is unavailable in this app build.");
    } else {
      setIsBusy(true);
      setDiagnosticMessage(null);
      try {
        const nextPreview = await previewRosterSave(request);
        setPreview(nextPreview);
        if (nextPreview.status === "ready") setIsReviewOpen(true);
        else setDiagnosticMessage(getDiagnosticsMessage(nextPreview.diagnostics));
      } catch {
        setDiagnosticMessage("Unable to prepare roster preview.");
      } finally {
        setIsBusy(false);
      }
    }
  };

  const handleSave = async (): Promise<void> => {
    const saveRoster = window.graiderUI.saveRoster;
    if (saveRoster === undefined)
      throw new Error("Roster management is unavailable in this app build.");
    if (preview?.status !== "ready")
      throw new Error("Prepare a valid roster preview before saving.");
    setIsBusy(true);
    try {
      const result = await saveRoster({ ...request, confirmed: true });
      if (result.status !== "success") {
        throw new Error(getDiagnosticsMessage(result.diagnostics) ?? "Unable to save roster.");
      }

      const savedRows = rows.map((row) => ({ ...row }));
      const savedFaculty = [...faculty];
      setBaselineRows(savedRows);
      setBaselineFaculty(savedFaculty);
      setLoadedSource(result.source);
      setPendingSourceKind(undefined);
      setIsExisting(true);
      setLoadState("ready");
      setRosterPath(result.path);
      setDiagnosticMessage(null);
      setPublicationWarning(
        result.publication?.status === "failure"
          ? (getDiagnosticsMessage(result.diagnostics) ??
              "Roster saved locally, but publication failed. Use Publish Course Changes to retry.")
          : null
      );
      if (isCreatingSection) {
        setSections((current) => (current.includes(sectionId) ? current : [...current, sectionId]));
        setIsCreatingSection(false);
      }
      clearReview();
      await refreshSummaries();
      onSaved();
    } finally {
      setIsBusy(false);
    }
  };

  const finishRemoval = async (action: "remove_roster" | "remove_section"): Promise<void> => {
    const remove =
      action === "remove_roster" ? window.graiderUI.removeRoster : window.graiderUI.removeSection;
    if (remove === undefined) return;
    const removeRequest: RosterRemoveRequest = {
      courseFolderId: courseFolder.id,
      courseFolderPath: courseFolder.path,
      termCode,
      sectionId,
      confirmed: true
    };
    setIsBusy(true);
    setDiagnosticMessage(null);
    try {
      const result = await remove(removeRequest);
      if (result.status === "success") {
        setSections((current) => current.filter((section) => section !== sectionId));
        setSectionId("");
        setLoadState("idle");
        setIsExisting(false);
        setBaselineRows([]);
        setDraftRows([]);
        setBaselineFaculty([]);
        setFaculty([]);
        setLoadedSource(undefined);
        setPendingSourceKind(undefined);
        setRosterPath(null);
        setDestructiveAction(null);
        setPublicationWarning(
          result.publication?.status === "failure"
            ? (getDiagnosticsMessage(result.diagnostics) ??
                "The local removal succeeded, but publication failed. Use Publish Course Changes to retry.")
            : null
        );
        showToast(action === "remove_roster" ? "Roster and section removed." : "Section removed.");
        await refreshSummaries();
        onSaved();
      } else {
        setDiagnosticMessage(getDiagnosticsMessage(result.diagnostics));
      }
    } catch {
      setDiagnosticMessage(
        action === "remove_roster"
          ? "Unable to remove the roster."
          : "Unable to remove the section."
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleDestructiveConfirm = (): void => {
    if (destructiveAction === "clear") {
      setDraftRows([]);
      setPendingSourceKind("manual_edit");
      setDestructiveAction(null);
      clearReview();
    } else if (destructiveAction !== null) {
      void finishRemoval(destructiveAction);
    }
  };

  const hasSectionContext = sectionId.length > 0;
  const overflowGroups: readonly OverflowMenuGroup[] = [
    {
      id: "roster-actions",
      heading: "Roster",
      items: [
        {
          id: "clear-roster",
          label: "Clear roster rows",
          caption: "Stage an empty roster for review",
          destructive: true,
          disabled: !hasSectionContext || rows.length === 0 || loadState !== "ready",
          onSelect: () => setDestructiveAction("clear")
        },
        {
          id: "remove-roster",
          label: "Remove roster",
          caption: "Removes the configured section and roster files",
          destructive: true,
          disabled: !hasSectionContext || !isExisting || isCreatingSection,
          onSelect: () => setDestructiveAction("remove_roster")
        },
        {
          id: "remove-section",
          label: "Remove section",
          caption: "Removes the section and any roster files",
          destructive: true,
          disabled: !hasSectionContext || isCreatingSection,
          onSelect: () => setDestructiveAction("remove_section")
        }
      ]
    }
  ];

  const currentRosterPath =
    rosterPath ?? (hasSectionContext ? `terms/${termCode}/rosters/section-${sectionId}.csv` : null);
  const technicalItems =
    currentRosterPath === null
      ? [
          {
            id: "course-folder",
            label: "Course folder path",
            value: courseFolder.path,
            copyable: true
          }
        ]
      : [
          { id: "roster-path", label: "Roster path", value: currentRosterPath, copyable: true },
          {
            id: "source-path",
            label: "Source metadata path",
            value: `terms/${termCode}/rosters/section-${sectionId}.source.json`,
            copyable: true
          },
          {
            id: "course-folder",
            label: "Course folder path",
            value: courseFolder.path,
            copyable: true
          }
        ];

  const destructiveCopy =
    destructiveAction === null ? null : getDestructiveDialogCopy(destructiveAction, sectionId);

  return (
    <main className="dashboard-shell roster-manager-page" aria-labelledby="roster-manager-title">
      <section className="dashboard-content roster-manager">
        <PageHeader
          eyebrow="Graider"
          meta={`${courseTitle} · ${termTitle}`}
          overflow={<OverflowMenu aria-label="More roster actions" groups={overflowGroups} />}
          title="Manage rosters"
          titleId="roster-manager-title"
        />

        <RosterSectionTabs
          onAddSection={() => requestNavigation({ type: "new_section" })}
          onSelect={(nextSectionId) =>
            requestNavigation({ type: "section", sectionId: nextSectionId })
          }
          sections={sections}
          selectedSectionId={isCreatingSection ? "" : sectionId}
          summaries={summaries}
        />

        {sections.length === 0 && !isCreatingSection ? (
          <section className="roster-empty-state roster-empty-state--page">
            <h2>No sections configured for this term.</h2>
            <button className="secondary-action" onClick={startNewSection} type="button">
              Add section
            </button>
          </section>
        ) : null}

        {!isCreatingSection ? null : (
          <section className="roster-new-section" aria-labelledby="new-section-title">
            <div>
              <h2 id="new-section-title">New section</h2>
              <p>Define the section, then add students manually or replace from CSV.</p>
            </div>
            <label>
              Section ID
              <input
                autoFocus
                onChange={(event) => {
                  const nextSectionId = event.target.value;
                  setSectionId(nextSectionId);
                  setDraftRows((current) =>
                    current.map((draftRow) => ({
                      ...draftRow,
                      row: { ...draftRow.row, section: nextSectionId }
                    }))
                  );
                  setPendingSourceKind("manual_edit");
                  clearReview();
                }}
                placeholder="001"
                value={sectionId}
              />
            </label>
          </section>
        )}

        {diagnosticMessage === null ? null : (
          <p className="error-message roster-manager__message" role="alert">
            {diagnosticMessage}
          </p>
        )}
        {publicationWarning === null ? null : (
          <p className="roster-manager__publication-warning" role="alert">
            <strong>Saved locally.</strong> {publicationWarning}
          </p>
        )}

        {!hasSectionContext ? null : (
          <RosterSourceBar
            disabled={loadState === "loading" || sectionId.trim().length === 0}
            emptySourceExplanation={
              isCreatingSection || !isExisting
                ? "The first roster-data save will establish a source."
                : "This roster predates source tracking. The next roster-data save will establish a source."
            }
            onReplace={replaceFromCsv}
            pendingSourceKind={isDirty ? effectivePendingSourceKind : undefined}
            source={loadedSource}
          />
        )}

        {loadState === "loading" ? <p role="status">Loading section…</p> : null}
        {loadState === "invalid" && hasSectionContext ? (
          <section className="roster-attention-state">
            <h2>Roster needs attention</h2>
            <p>
              The roster could not be loaded safely. Review the diagnostic above or replace it from
              CSV.
            </p>
          </section>
        ) : null}

        {loadState === "ready" && hasSectionContext ? (
          <>
            {!isExisting && !isCreatingSection ? (
              <p className="roster-manager__empty-notice">
                No roster has been created for this section yet. Add students manually or replace
                from CSV.
              </p>
            ) : null}
            {isExisting && rows.length === 0 && rosterDiff.totalChangeCount === 0 ? (
              <p className="roster-manager__empty-notice">This is a valid empty roster.</p>
            ) : null}
            <div className="roster-workspace">
              <RosterStudentTable
                draftRows={draftRows}
                emptyMessage={
                  isExisting
                    ? "This valid roster currently has no student rows."
                    : "No roster rows yet. Add a student or replace from CSV."
                }
                onAdd={addStudent}
                onRemove={removeStudent}
                onSetStatus={setRowStatus}
                onUndoRemove={undoRemove}
                onUpdate={updateRow}
                removedDiffs={removedDiffs}
                rowDiffs={rosterDiff.rows}
              />
              <aside className="roster-sidebar" aria-label="Section details">
                <RosterFacultyPanel faculty={faculty} onAdd={addFaculty} onRemove={removeFaculty} />
                <RosterStatsCard rows={rows} />
              </aside>
            </div>
          </>
        ) : null}

        <TechnicalDetails items={technicalItems} />

        {!isDirty ? null : (
          <UnsavedChangesBar
            message={getUnsavedMessage(rosterDiff, facultyDiff.changed, isCreatingSection)}
            onDiscard={discardDraft}
            onSave={() => void handlePreview()}
            saving={isBusy}
          />
        )}
      </section>

      <RosterSaveReview
        diff={rosterDiff}
        facultyDiff={facultyDiff}
        isCreatingSection={isCreatingSection}
        isOpen={isReviewOpen && preview?.status === "ready"}
        onCancel={() => setIsReviewOpen(false)}
        onConfirm={handleSave}
        onSuccess={showToast}
      />

      <ConfirmDialog
        confirmationWord={sectionId}
        confirmLabel={destructiveCopy?.confirmLabel ?? "Confirm"}
        isConfirming={isBusy}
        isOpen={destructiveCopy !== null}
        onCancel={() => setDestructiveAction(null)}
        onConfirm={handleDestructiveConfirm}
        summary={destructiveCopy?.summary ?? ""}
        title={destructiveCopy?.title ?? "Confirm action"}
      />

      <ConfirmDialog
        confirmLabel="Discard and continue"
        isOpen={isDiscardDialogOpen}
        onCancel={() => {
          setIsDiscardDialogOpen(false);
          setPendingNavigation(null);
        }}
        onConfirm={() => {
          const navigation = pendingNavigation;
          setIsDiscardDialogOpen(false);
          setPendingNavigation(null);
          if (navigation !== null) performNavigation(navigation);
        }}
        summary="Your unsaved roster and faculty changes will be discarded."
        title="Discard unsaved changes?"
      />
      <Toast message={toastMessage} />
    </main>
  );
};
