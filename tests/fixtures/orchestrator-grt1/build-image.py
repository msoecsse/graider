"""Offline, source-bound GRT1 test image. No extraction or guest execution on host.

Usage: build-image.py ROOTFS_INPUTS PINNED_PACKAGES OUTPUT EXPECTED_SHA256
Use literal 'candidate-only' for a new, unlaunchable candidate build. It never
updates pins. Review source/input changes, record a pin, then rebuild twice with
that exact digest before launching. The launch verifier independently checks it.
"""
import gzip
import hashlib
import io
import json
import pathlib
import stat
import sys
import tarfile

ROOTFS, PACKAGES, OUTPUT = (pathlib.Path(value) for value in sys.argv[1:4])
EXPECTED = sys.argv[4]
HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE.parents[2] / "scripts" / "orchestrator" / "grt1"
PINS = json.loads((SOURCE / "test-image-pins.json").read_text())
ROOTFS_SHA256 = "4b14c18f7e90a063b61462ea1462a5732c154bf6adad594974fe6487cd98a8de"
KERNEL_SHA256 = "cd05fed9e617b5df93dc62ece9b78c422fd94e9b432a2f7c092714b139d5eef4"


def verified(filename, expected):
    data = filename.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise SystemExit("Unreviewed source/input digest")
    return data


for name, expected in PINS["sources"].items():
    verified(SOURCE / name, expected)
entries = {}


def load(data, apk=False):
    with tarfile.open(fileobj=io.BytesIO(gzip.decompress(data)), mode="r:", ignore_zeros=True) as archive:
        for item in archive:
            name = item.name.removeprefix("./").rstrip("/")
            if not name or name.startswith("dev/") or (apk and name.startswith(".")):
                pass
            elif name.startswith("/") or ".." in name.split("/"):
                raise SystemExit("Unsafe archive input")
            elif item.isfile():
                entries[name] = (stat.S_IFREG | item.mode, archive.extractfile(item).read())
            elif item.isdir():
                entries[name] = (stat.S_IFDIR | item.mode, b"")
            elif item.issym():
                entries[name] = (stat.S_IFLNK | item.mode, item.linkname.encode())
            elif item.islnk():
                target = item.linkname.removeprefix("./")
                if target not in entries or not stat.S_ISREG(entries[target][0]):
                    raise SystemExit("Unknown hardlink in trusted package")
                entries[name] = entries[target]
            else:
                raise SystemExit("Unsupported trusted archive type")


load(verified(ROOTFS / "rootfs.tar.gz", ROOTFS_SHA256))
for package in PINS["packages"]:
    load(verified(PACKAGES / package["file"], package["sha256"]), apk=True)
entries["init"] = (stat.S_IFREG | 0o755, (HERE.parent / "orchestrator-native-edit" / "bootstrap.sh").read_bytes())
entries["guest-init"] = (stat.S_IFREG | 0o555, (SOURCE / "guest-init.sh").read_bytes())
entries["grt1"] = (stat.S_IFDIR | 0o555, b"")
entries["grt1/guest.py"] = (stat.S_IFREG | 0o444, (SOURCE / "guest.py").read_bytes())
archive = io.BytesIO()


def add(index, name, mode, data):
    raw = (name + "\0").encode()
    fields = [index, mode, 0, 0, 1, 0, len(data), 0, 0, 0, 0, len(raw), 0]
    header = b"070701" + b"".join(("%08x" % value).encode() for value in fields)
    archive.write(header + raw)
    archive.write(b"\0" * ((-len(header + raw)) % 4))
    archive.write(data)
    archive.write(b"\0" * ((-len(data)) % 4))


for index, (name, (mode, data)) in enumerate(sorted(entries.items()), 1):
    add(index, name, mode, data)
add(len(entries) + 1, "TRAILER!!!", 0, b"")
image = bytearray(gzip.compress(archive.getvalue(), compresslevel=1, mtime=0))
image[9] = 255  # Canonical gzip OS field, independent of Python's host default.
actual = hashlib.sha256(image).hexdigest()
if EXPECTED != "candidate-only" and (EXPECTED != PINS["imageSha256"] or actual != EXPECTED):
    raise SystemExit("Image digest mismatch; no pin regeneration")
OUTPUT.mkdir(mode=0o700, parents=True, exist_ok=False)
name = "candidate-initramfs.gz" if EXPECTED == "candidate-only" else "guest-initramfs.gz"
(OUTPUT / name).write_bytes(image)
(OUTPUT / "vmlinuz-virt").write_bytes(verified(ROOTFS / "vmlinuz-virt", KERNEL_SHA256))
print(json.dumps(dict(imageSha256=actual, bytes=len(image), entries=len(entries), candidateOnly=EXPECTED == "candidate-only")))
