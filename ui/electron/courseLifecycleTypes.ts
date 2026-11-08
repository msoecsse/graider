export type CourseLifecycleResult =
  | {
      readonly status: "needs_attention";
      readonly reason: string;
      readonly beforeStatus?: "unarchived" | "archived";
      readonly afterStatus?: "unarchived" | "archived";
      readonly authorizationBasis?: string;
    }
  | {
      readonly status: "up_to_date" | "archived" | "unarchived";
      readonly beforeStatus: "unarchived" | "archived";
      readonly afterStatus: "unarchived" | "archived";
      readonly authorizationBasis: string;
      readonly revision: string;
      readonly refreshRequired: boolean;
    };
