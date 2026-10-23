import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GithubAccountPanel } from "./GithubAccountPanel";
import type { GithubOAuthState } from "../../electron/githubOAuthTypes";

const signedOut: GithubOAuthState = {
  status: "signed_out",
  identity: null,
  busy: false,
  persistence: "unknown",
  message: null
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
