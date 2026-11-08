export interface SetupFacultySelection {
  readonly institutionalUsername: string;
  readonly githubLogin: string;
}
export interface NewRemoteCourseRequest {
  readonly organization: string;
  readonly repositoryName: string;
  readonly courseCode: string;
  readonly courseTitle: string;
  readonly creatorInstitutionalUsername: string;
  readonly termCode: string;
  readonly coordinators: readonly SetupFacultySelection[];
  readonly sections: readonly {
    readonly id: string;
    readonly faculty: readonly SetupFacultySelection[];
  }[];
}
export interface VerifiedSetupFaculty {
  readonly institutionalUsername: string;
  readonly githubLogin: string;
  readonly githubUserId: number;
}
export interface RemoteCourseSetupPreview {
  readonly previewId: string;
  readonly creator: VerifiedSetupFaculty;
  readonly coordinators: readonly VerifiedSetupFaculty[];
  readonly sections: readonly {
    readonly id: string;
    readonly faculty: readonly VerifiedSetupFaculty[];
  }[];
}
export interface RemoteCourseSetupResult {
  readonly status: "created" | "created_needs_attention";
  readonly repositoryId: number;
  readonly repositoryUrl: string;
  readonly revision?: string;
  readonly message: string;
}
export interface RemoteCourseSetupApi {
  close?(): Promise<void>;
  preview(request: NewRemoteCourseRequest): Promise<RemoteCourseSetupPreview>;
  create(previewId: string, confirmed: true): Promise<RemoteCourseSetupResult>;
}
