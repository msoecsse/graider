export interface ApplyRepositoryProgress {
  readonly current: number;
  readonly total: number;
  readonly repository: string;
  readonly mode: "individual" | "group";
  readonly studentId?: string;
  readonly groupId?: string;
}

export type ApplyRepositoryProgressObserver = (progress: ApplyRepositoryProgress) => void;

export const reportApplyRepositoryProgress = (
  observer: ApplyRepositoryProgressObserver | undefined,
  progress: ApplyRepositoryProgress
): void => {
  try {
    observer?.(progress);
  } catch {
    // Progress is observational and must not alter Apply execution.
  }
};
