import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GradingSubmissionTiming } from "./GradingSubmissionTiming";

const DUE = "2026-11-21T12:00:00-06:00";

describe("grading submission timing", () => {
  it.each([
    ["2026-11-23T15:00:00-06:00", "Late by 2 days, 3 hours"],
    ["2026-11-21T17:59:59Z", "On time"],
    ["2026-11-21T18:00:00Z", "On time"],
    ["2026-11-21T18:00:00.001Z", "Late by less than a minute"],
    ["2026-11-21T18:01:00Z", "Late by 1 minute"],
    ["2026-11-22T17:59:59Z", "Late by 23 hours, 59 minutes"],
    ["2026-11-22T18:00:00Z", "Late by 1 day"],
    [undefined, "Submission time unavailable"],
    ["not-a-date", "Submission time unavailable"]
  ])("shows %s as %s", (submittedAt, expected) => {
    render(<GradingSubmissionTiming studentId="ada" dueAt={DUE} submittedAt={submittedAt} />);
    expect(screen.getByLabelText("Submission timing for ada")).toHaveTextContent(expected);
  });

  it("shows a neutral status without a due date", () => {
    render(<GradingSubmissionTiming studentId="ada" />);
    expect(screen.getByText("No due date")).toBeInTheDocument();
  });

  it("does not interpret a deadline without a timezone or an invalid deadline", () => {
    const { rerender } = render(
      <GradingSubmissionTiming studentId="ada" dueAt="2026-11-21T12:00:00" submittedAt={DUE} />
    );
    expect(screen.getByText("Due time unavailable")).toBeInTheDocument();
    rerender(<GradingSubmissionTiming studentId="ada" dueAt="invalid" submittedAt={DUE} />);
    expect(screen.getByText("Due time unavailable")).toBeInTheDocument();
  });

  it("uses elapsed hours across DST instead of calendar dates", () => {
    render(
      <GradingSubmissionTiming
        studentId="ada"
        dueAt="2026-11-01T00:00:00-05:00"
        submittedAt="2026-11-02T00:00:00-06:00"
      />
    );
    expect(screen.getByText("Late by 1 day, 1 hour")).toBeInTheDocument();
  });

  it("replaces the identity and timing on student navigation", () => {
    const { rerender } = render(
      <GradingSubmissionTiming
        studentId="ada"
        dueAt={DUE}
        submittedAt="2026-11-23T15:00:00-06:00"
      />
    );
    rerender(<GradingSubmissionTiming studentId="grace" dueAt={DUE} />);
    expect(screen.queryByText(/Late by/u)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Submission timing for grace")).toHaveTextContent(
      "Submission time unavailable"
    );
  });
});
