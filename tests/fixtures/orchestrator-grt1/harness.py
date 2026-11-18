"""Deterministic tests only. Never included in the reviewed guest image."""
import importlib.util
import os
import sys

spec = importlib.util.spec_from_file_location("fixed_grt1", sys.argv[1])
guest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guest)
root, mutation = sys.argv[2:]
# Load a fixed test-only filesystem double by an explicit adjacent path.
fs_spec = importlib.util.spec_from_file_location("kernel_double", os.path.join(os.path.dirname(__file__), "filesystem.py"))
fs = importlib.util.module_from_spec(fs_spec)
fs_spec.loader.exec_module(fs)
kernel = fs.Kernel(root)
if mutation == "workspace-full":
    kernel.capacity = 1
guest.os = kernel
guest.guest_usage = lambda receiver: (0, 0, 0, 0, 0)
receiver = guest.Receiver(root)
incoming, outgoing = sys.stdin.buffer, sys.stdout.buffer
outgoing.write(f"GRT1 READY {guest.PROFILE}\n".encode())
outgoing.flush()
active = True
try:
    while active:
        wire = incoming.readline(guest.FRAME + 1)
        guest.require(wire != b"")
        if mutation == "crash":
            os._exit(1)
        if mutation == "allocation-failure":
            raise MemoryError("synthetic allocation failure")
        if mutation == "stall":
            incoming.read()
            os._exit(1)
        operation = wire.rstrip(b"\n").split(b" ")[3]
        if operation == b"M" and mutation.startswith("ingress-"):
            fields = wire.rstrip(b"\n").split(b" ")
            kind = mutation.removeprefix("ingress-")
            if kind == "session":
                fields[1] = b"0" * 32
            if kind == "version":
                fields[0] = b"GRT2"
            if kind == "sequence":
                fields[2] = b"0"
            if kind == "phase":
                fields[3] = b"D"
            if kind == "offset":
                fields[4] = b"1"
            if kind == "length":
                fields[5] = b"1"
            if kind == "digest":
                fields[6] = b"0" * 64
            wire = b" ".join(fields) + b"\n"
            if kind == "truncated":
                wire = wire[:-1]
            if kind == "oversized":
                wire = b"x" * (guest.FRAME + 1)
            if kind == "duplicate":
                receiver.handle(wire)
        if mutation == "noncanonical-manifest" and operation == b"M":
            # Mutate canonical JSON and its chunk digest, preserving declared
            # stream identity: SEAL_MANIFEST must still reject this transcript.
            fields = wire.rstrip(b"\n").split(b" ")
            data = guest.base64.b64decode(fields[-1]).replace(b'"version":1', b'"version":2')
            fields[-2] = guest.digest(data).encode()
            fields[-1] = guest.base64.b64encode(data)
            wire = b" ".join(fields) + b"\n"
        if operation == b"SEAL_DATA" and mutation in ("extra", "missing", "symlink", "hardlink", "fifo", "mode", "corrupt"):
            files = receiver.manifest["files"]
            first = root + "/" + files[1]["path"]
            if mutation == "extra":
                kernel.entries[root + "/extra"] = dict(data=b"", mode=fs.stat.S_IFREG | 0o644, links=1)
            elif mutation == "missing":
                del kernel.entries[first]
            elif mutation == "symlink":
                kernel.entries[first]["mode"] = fs.stat.S_IFLNK | 0o777
            elif mutation == "hardlink":
                kernel.entries[first]["links"] = 2
            elif mutation == "fifo":
                kernel.entries[first]["mode"] = fs.stat.S_IFIFO | 0o644
            elif mutation == "mode":
                kernel.entries[first]["mode"] = fs.stat.S_IFREG | 0o600
            elif mutation == "corrupt":
                kernel.entries[first]["data"] = b"corruption" + kernel.entries[first]["data"][10:]
        if operation == b"START" and mutation == "nonempty":
            kernel.entries[root + "/preexisting"] = dict(data=b"", mode=fs.stat.S_IFREG | 0o644, links=1)
        response = receiver.handle(wire)
        if operation == b"START" and mutation.startswith("ack-"):
            fields = response.split(b" ")
            if mutation == "ack-phase":
                fields[4] = b"SEAL_DATA"
            if mutation == "ack-offset":
                fields[5] = b"1"
            if mutation == "ack-digest":
                fields[6] = b"0" * 64 + b"\n"
            response = b" ".join(fields)
        elif operation == b"START" and mutation == "forged-ack":
            response = response.replace(b" 0 ACK", b" 1 ACK")
        elif operation == b"GET" and receiver.state == "readback":
            fields = response.split(b" ")
            if mutation == "session":
                fields[1] = b"0" * 32
            if mutation == "version":
                fields[0] = b"GRT2"
            if mutation == "sequence":
                fields[2] = b"0"
            if mutation == "phase":
                fields[3] = b"D"
            if mutation == "offset":
                fields[4] = b"1"
            if mutation == "length":
                fields[5] = b"1"
            if mutation == "digest":
                fields[6] = b"0" * 64
            response = b" ".join(fields)
            if mutation == "duplicate":
                response += response
            if mutation == "truncated":
                outgoing.write(response[:-1])
                outgoing.flush()
                os._exit(1)
            if mutation == "oversized":
                response = b"x" * (guest.FRAME + 1)
            if mutation == "noise":
                response = b"noise\n" + response
            if mutation == "diagnostic":
                sys.stderr.buffer.write(b"untrusted diagnostic")
                sys.stderr.buffer.flush()
        outgoing.write(response)
        outgoing.flush()
        active = receiver.state != "finished"
    incoming.read()
except BaseException:
    os._exit(1)
