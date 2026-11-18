"""Offline image construction only. Never extract or execute guest inputs on host.

Usage: python3 build-image.py INPUT_DIRECTORY OUTPUT_DIRECTORY
The input directory contains the reviewed rootfs.tar.gz and codex-linux.tgz.
"""
import gzip
import hashlib
import io
import pathlib
import stat
import sys
import tarfile

SOURCE = pathlib.Path(sys.argv[1])
OUTPUT = pathlib.Path(sys.argv[2])
FIXTURES = pathlib.Path(__file__).resolve().parent
PINNED = {
    "rootfs.tar.gz": "4b14c18f7e90a063b61462ea1462a5732c154bf6adad594974fe6487cd98a8de",
    "codex-linux.tgz": "e24d7b6f0af5695a36c04692c3a79672bdadebcac7c44005259cb3cad36ac40e",
    "vmlinuz-virt": "cd05fed9e617b5df93dc62ece9b78c422fd94e9b432a2f7c092714b139d5eef4",
}
for filename, expected in PINNED.items():
    if hashlib.sha256((SOURCE / filename).read_bytes()).hexdigest() != expected:
        raise SystemExit("Unreviewed input")

archive = io.BytesIO()
index = 0


def add(name, mode, data=b""):
    global index
    index += 1
    raw = (name + "\0").encode()
    fields = [index, mode, 0, 0, 1, 0, len(data), 0, 0, 0, 0, len(raw), 0]
    header = b"070701" + b"".join(("%08x" % value).encode() for value in fields)
    archive.write(header + raw)
    archive.write(b"\0" * ((-len(header + raw)) % 4))
    archive.write(data)
    archive.write(b"\0" * ((-len(data)) % 4))


with tarfile.open(SOURCE / "rootfs.tar.gz") as source:
    for item in source:
        name = item.name.removeprefix("./").rstrip("/")
        if not name or name.startswith("dev/"):
            pass
        elif name.startswith("/") or ".." in name.split("/"):
            raise SystemExit("Unsafe archive path")
        elif item.isfile():
            add(name, stat.S_IFREG | item.mode, source.extractfile(item).read())
        elif item.isdir():
            add(name, stat.S_IFDIR | item.mode)
        elif item.issym():
            add(name, stat.S_IFLNK | item.mode, item.linkname.encode())

for guest_name, source in [
    ("init", FIXTURES.parent / "orchestrator-native-edit" / "bootstrap.sh"),
    ("guest-init", FIXTURES / "guest-init.sh"),
    ("guest-command", FIXTURES / "guest-command.sh"),
    ("guest-file", FIXTURES / "guest-file.sh"),
]:
    add(guest_name, stat.S_IFREG | 0o755, source.read_bytes())
for name in ["opt", "opt/codex", "opt/codex/bin", "opt/codex/codex-resources"]:
    add(name, stat.S_IFDIR | 0o755)
with tarfile.open(SOURCE / "codex-linux.tgz") as source:
    for item in source:
        if item.isfile() and item.name.endswith(("/bin/codex", "/bin/codex-code-mode-host", "/codex-resources/bwrap")):
            name = "opt/codex/" + item.name.split("aarch64-unknown-linux-musl/")[1]
            add(name, stat.S_IFREG | 0o755, source.extractfile(item).read())
add("guest-protected.txt", stat.S_IFREG | 0o444, b"protected-guest")
add("TRAILER!!!", 0)
OUTPUT.mkdir(mode=0o700, parents=True, exist_ok=True)
(OUTPUT / "guest-initramfs.gz").write_bytes(gzip.compress(archive.getvalue(), compresslevel=1, mtime=0))
(OUTPUT / "vmlinuz-virt").write_bytes((SOURCE / "vmlinuz-virt").read_bytes())
print(hashlib.sha256((OUTPUT / "guest-initramfs.gz").read_bytes()).hexdigest())
