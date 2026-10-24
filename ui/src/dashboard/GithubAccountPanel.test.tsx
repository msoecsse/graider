import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GithubAccountPanel } from "./GithubAccountPanel";
import type { GithubOAuthState } from "../../electron/githubOAuthTypes";

const signedOut: GithubOAuthState = {
  status: "signed_out",
  identity: null,
  busy: false,
  persistence: "unknown",
  message: null,
  organizationPermission: "unknown",
  organizationDiscovery: { status: "idle", organizations: [], message: null, stale: false }
};
const signedIn: GithubOAuthState = {
  ...signedOut,
  status: "signed_in",
  identity: { login: "octocat", id: 42, name: "Octo Cat" },
  persistence: "secure"
};
const setup = (initial = signedOut) => {
  const api = {
    get: vi.fn().mockResolvedValue(initial),
    refreshOrganizations: vi
      .fn()
      .mockResolvedValue({ ...signedIn, organizationPermission: "available" }),
    manageAuthorization: vi.fn().mockResolvedValue(initial),
    signIn: vi.fn().mockResolvedValue(signedIn),
    signOut: vi.fn().mockResolvedValue(signedOut),
    switchAccount: vi
      .fn()
      .mockResolvedValue({ ...signedIn, identity: { login: "second", id: 99, name: null } }),
    cancel: vi.fn().mockResolvedValue(signedOut)
  };
  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: { ...window.graiderUI, githubOAuth: api }
  });
  render(<GithubAccountPanel />);
  return api;
};
describe("GitHub faculty account", () => {
  it("offers sign-in, displays canonical login, switches and signs out", async () => {
    const api = setup();
    await waitFor(() => expect(api.get).toHaveBeenCalledOnce());
    expect(screen.getByText("GitHub: Not signed in")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to GitHub" }));
    expect(await screen.findByText("Signed in to GitHub as octocat")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in as another account" }));
    expect(await screen.findByText("Signed in to GitHub as second")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("GitHub: Not signed in")).toBeInTheDocument();
    expect(api.signOut).toHaveBeenCalledOnce();
    expect(api.switchAccount).toHaveBeenCalledOnce();
  });
  it("keeps the previous identity visible during a canceled switch", async () => {
    const api = setup(signedIn);
    api.switchAccount.mockResolvedValue({ ...signedIn, message: "GitHub sign-in canceled." });
    await screen.findByText("Signed in to GitHub as octocat");
    fireEvent.click(screen.getByRole("button", { name: "Sign in as another account" }));
    expect(await screen.findByRole("status")).toHaveTextContent("canceled");
    expect(screen.getByText("Signed in to GitHub as octocat")).toBeInTheDocument();
  });
  it("refreshes a pending session reopened after navigation", async () => {
    const api = setup({ ...signedOut, busy: true });
    await waitFor(() => expect(api.get).toHaveBeenCalledOnce());
    api.get.mockResolvedValue(signedIn);
    expect(await screen.findByText("Signed in to GitHub as octocat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });
  it("shows preserved offline credential state and scope distinction", async () => {
    setup({ ...signedOut, status: "unavailable", message: "Saved credential preserved." });
    expect(await screen.findByText("GitHub: Saved sign-in unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Course and repository operations still use/)).toBeInTheDocument();
  });
});

const organizationsState: GithubOAuthState = {
  ...signedIn,
  organizationPermission: "available",
  organizationDiscovery: {
    status: "ready",
    message: null,
    stale: false,
    organizations: [
      {
        organizationId: 1,
        login: "faculty-course-org",
        membershipState: "active",
        membershipRole: "admin",
        directMembership: true,
        accessStatus: "accessible",
        accessDiagnostic: "Access verified."
      },
      {
        organizationId: 2,
        login: "pending-org",
        membershipState: "pending",
        membershipRole: "member",
        directMembership: null,
        accessStatus: "pending",
        accessDiagnostic: "Accept on GitHub."
      },
      {
        organizationId: 3,
        login: "restricted-org",
        membershipState: "active",
        membershipRole: "member",
        directMembership: true,
        accessStatus: "oauth_approval_required",
        accessDiagnostic: "Your sign-in is valid; an owner may need to approve Graider."
      }
    ]
  }
};
describe("faculty organizations", () => {
  it("shows role, pending invitation, restriction and a trusted remediation action", async () => {
    const api = setup(organizationsState);
    expect(await screen.findByRole("region", { name: "Organizations" })).toBeInTheDocument();
    expect(screen.getByText(/Owner — Accessible/)).toBeInTheDocument();
    expect(screen.getByText(/Member — Invitation pending/)).toBeInTheDocument();
    expect(screen.getByText(/Member — Graider needs approval/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Manage GitHub authorization" })[0]!);
    await waitFor(() => expect(api.manageAuthorization).toHaveBeenCalledWith());
  });
  it("refreshes classifications, switches accounts and clears organizations on sign out", async () => {
    const api = setup(organizationsState);
    await screen.findByText("faculty-course-org");
    fireEvent.click(screen.getByRole("button", { name: "Refresh organizations" }));
    await waitFor(() => expect(screen.queryByText("faculty-course-org")).not.toBeInTheDocument());
    expect(api.refreshOrganizations).toHaveBeenCalledOnce();
    api.signIn.mockResolvedValue(organizationsState);
    fireEvent.click(screen.getByRole("button", { name: "Update GitHub authorization" }));
    await screen.findByText("faculty-course-org");
    fireEvent.click(screen.getByRole("button", { name: "Sign in as another account" }));
    await screen.findByText("Signed in to GitHub as second");
    expect(screen.queryByText("faculty-course-org")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByText("GitHub: Not signed in");
    expect(screen.queryByRole("region", { name: "Organizations" })).not.toBeInTheDocument();
  });
  it("offers a permission upgrade without requiring sign out", async () => {
    const api = setup({ ...signedIn, organizationPermission: "required" });
    fireEvent.click(await screen.findByRole("button", { name: "Authorize organization access" }));
    await waitFor(() => expect(api.signIn).toHaveBeenCalledOnce());
  });
});
