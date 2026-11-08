import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RemoteCourseSetupPage } from "./RemoteCourseSetupPage";
import type { GithubOAuthState } from "../../electron/githubOAuthTypes";

const account = {
  identity: { id: 42, login: "creator-login" },
  organizationDiscovery: {
    organizations: [
      {
        organizationId: 10,
        login: "fixture",
        accessStatus: "accessible",
        membershipState: "active",
        membershipRole: "admin"
      }
    ]
  }
} as unknown as GithubOAuthState;
const creator = {
  institutionalUsername: "creator",
  githubLogin: "creator-login",
  githubUserId: 42
};
const verified = {
  previewId: "main-owned-review",
  creator,
  coordinators: [
    { institutionalUsername: "coordinator", githubLogin: "coordinator-login", githubUserId: 43 }
  ],
  sections: [
    {
      id: "001",
      faculty: [
        { institutionalUsername: "teacher", githubLogin: "teacher-login", githubUserId: 44 }
      ]
    }
  ]
};
const fill = () => {
  fireEvent.change(screen.getByLabelText("GitHub organization"), { target: { value: "fixture" } });
  for (const [label, value] of [
    ["New private repository name", "course"],
    ["Course code", "CSC"],
    ["Course title", "Course"],
    ["Your institutional username", "creator"],
    ["Initial term code (YYs1, YYs2 or YYs3)", "27s1"]
  ])
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
};
describe("remote course setup selections", () => {
  it("keeps creator fallback separate, verifies explicit coordinator and teaching selections, and confirms only the retained review", async () => {
    const preview = vi.fn().mockResolvedValue(verified);
    const create = vi.fn().mockResolvedValue({
      status: "created",
      repositoryId: 20,
      repositoryUrl: "https://github.com/fixture/course",
      message: "Course created."
    });
    Object.assign(window.graiderUI, { remoteCourseSetup: { preview, create } });
    render(<RemoteCourseSetupPage account={account} onBack={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByLabelText("Coordinator 1 GitHub username")).toHaveValue("");
    fill();
    fireEvent.change(screen.getByLabelText("Coordinator 1 institutional username"), {
      target: { value: "coordinator" }
    });
    fireEvent.change(screen.getByLabelText("Coordinator 1 GitHub username"), {
      target: { value: "coordinator-login" }
    });
    fireEvent.click(screen.getByText("Add section 001 faculty"));
    fireEvent.change(screen.getByLabelText("Section 001 faculty 1 institutional username"), {
      target: { value: "teacher" }
    });
    fireEvent.change(screen.getByLabelText("Section 001 faculty 1 GitHub username"), {
      target: { value: "teacher-login" }
    });
    fireEvent.click(screen.getByText("Verify setup"));
    await screen.findByText("Verified selections");
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinators: [{ institutionalUsername: "coordinator", githubLogin: "coordinator-login" }],
        sections: [
          {
            id: "001",
            faculty: [{ institutionalUsername: "teacher", githubLogin: "teacher-login" }]
          }
        ]
      })
    );
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Create private course"));
    await waitFor(() => expect(create).toHaveBeenCalledWith("main-owned-review", true));
    expect(await screen.findByText(/Course created/)).toBeInTheDocument();
  });
  it("allows explicit self selection without assigning section teaching authority", async () => {
    const preview = vi.fn().mockResolvedValue({
      ...verified,
      coordinators: [creator],
      sections: [{ id: "001", faculty: [] }]
    });
    Object.assign(window.graiderUI, { remoteCourseSetup: { preview, create: vi.fn() } });
    render(<RemoteCourseSetupPage account={account} onBack={vi.fn()} onCreated={vi.fn()} />);
    fill();
    fireEvent.click(screen.getByText("Select me as a coordinator"));
    fireEvent.click(screen.getByText("Verify setup"));
    await waitFor(() =>
      expect(preview).toHaveBeenCalledWith(
        expect.objectContaining({
          coordinators: [{ institutionalUsername: "creator", githubLogin: "creator-login" }],
          sections: [{ id: "001", faculty: [] }]
        })
      )
    );
  });
});
