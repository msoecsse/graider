// Supervisor-only guardian. Guest receives only QEMU's serial pipes, never IPC.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import process from "node:process";

const VM_LEASE_MS = 120_000;
const TERM_GRACE_MS = 250;
const GROUP_REAP_ATTEMPTS = 20;
const REAP_RETRY_MS = 50;
export function supervise(
  parent,
  spawnVm = spawn,
  kill = process.kill,
  writeEvidence = writeFileSync
) {
  let child;
  let stopping = false;
  let killTimer;
  let leaseTimer;
  let evidenceFile;
  let stopReason = "qemu-exit";
  let stderrBytes = 0;
  function evidence(status, code) {
    if (evidenceFile) {
      try {
        writeEvidence(
          evidenceFile,
          JSON.stringify({
            status,
            pid: child?.pid,
            code,
            stopReason,
            stderrBytes,
            at: new Date().toISOString()
          }),
          { mode: 0o600 }
        );
      } catch {
        /* Evidence failure must never prevent terminating the VM. */
      }
    }
  }
  function killGroup(signal) {
    if (child?.pid) {
      try {
        kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") parent.exitCode = 1;
      }
    }
  }
  function stop(reason = "caller-stop") {
    if (!stopping) {
      stopping = true;
      stopReason = reason;
      killGroup("SIGTERM");
      killTimer = globalThis.setTimeout(() => killGroup("SIGKILL"), TERM_GRACE_MS);
      if (!child) finish(null);
    }
  }
  function finish(code, attempt = 0) {
    stopping = true;
    globalThis.clearTimeout(killTimer);
    globalThis.clearTimeout(leaseTimer);
    killGroup("SIGKILL");
    // A close event means waitpid and all inherited QEMU streams have completed.
    // Only attest after the process group no longer exists.
    let gone = true;
    if (child?.pid) {
      try {
        kill(-child.pid, 0);
        gone = false;
      } catch (error) {
        gone = error.code === "ESRCH";
      }
    }
    if (!gone && attempt < GROUP_REAP_ATTEMPTS) {
      globalThis.setTimeout(() => finish(code, attempt + 1), REAP_RETRY_MS);
    } else {
      evidence(gone ? "reaped" : "unverified", code);
      if (gone && parent.connected) parent.send({ type: "reaped", code });
      if (parent.connected) parent.disconnect();
      parent.stdin.destroy();
      parent.stdout.end();
      parent.stderr.end();
    }
  }
  parent.on("message", (message) => {
    if (message.type === "stop") stop();
    else if (message.type === "launch" && !child && !stopping) {
      evidenceFile = message.evidenceFile;
      child = spawnVm(message.file, message.args, {
        cwd: message.cwd,
        env: message.env,
        detached: true,
        shell: false,
        stdio: "pipe"
      });
      if (parent.connected) parent.send({ type: "spawned", pid: child.pid });
      evidence("started", null);
      parent.stdin.pipe(child.stdin);
      child.stdout.pipe(parent.stdout);
      // Drain and discard stderr; secrets and raw runtime errors never enter evidence.
      child.stderr.on("data", (data) => {
        stderrBytes += data.length;
      });
      child.stdin.on("error", () => stop("transport-failed"));
      child.on("error", () => stop("spawn-failed"));
      child.on("exit", () => killGroup("SIGKILL"));
      child.on("close", (code) => finish(code));
      leaseTimer = globalThis.setTimeout(() => stop("lease-expired"), VM_LEASE_MS);
    } else stop();
  });
  parent.on("disconnect", () => stop("caller-disconnected"));
  parent.stdin.on("end", () => stop("caller-eof"));
  parent.stdin.on("error", () => stop("transport-failed"));
  parent.stdout.on("error", () => stop("transport-failed"));
  parent.stderr.on("error", () => stop("transport-failed"));
  parent.on("uncaughtException", () => stop("watchdog-failed"));
  parent.on("unhandledRejection", () => stop("watchdog-failed"));
  parent.on("SIGTERM", () => stop("signal"));
  parent.on("SIGINT", () => stop("signal"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) supervise(process);
