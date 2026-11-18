"""Fixed GRT1/v1 image helper. CLI owns /work; never execute from an imported tree.

Only Python's standard library; no process execution, dynamic imports from /work,
guest-supplied commands, archives or host paths. Tests import Receiver explicitly.
"""
import base64
import hashlib
import json
import os
import re
import stat
import sys

PROFILE = "GRT1-test-2c2"
CHUNK = 32768
FRAME = 44000
HEADER = 256
FILE = 524288
TOTAL = 16777216
FILES = 2048
DIRECTORIES = 1024
METADATA = 1048576
WIRE = 67108864
OPERATIONS = 1126
PATH_BYTES = 240
EMPTY = hashlib.sha256(b"").hexdigest()
UINT = r"(?:0|[1-9][0-9]{0,8})"
HASH = r"[a-f0-9]{64}"
DATA = re.compile(rf"([MDRI]) ({UINT}) ({UINT}) ({HASH}) ([A-Za-z0-9+/]+={{0,2}})")
PROTECTED = re.compile(r"(?:\.git|\.codex|\.agents|\.claude|\.ssh|\.aws|\.azure|\.gnupg|\.config|\.gitconfig|\.gitmodules|\.git-credentials|\.netrc|\.npmrc|\.pypirc)", re.I)
RESERVED = re.compile(r"(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?", re.I)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def require(condition):
    if not condition:
        raise ValueError("GRT1 rejected")


def number(value, maximum):
    require(type(value) is int and 0 <= value <= maximum)
    return value


def decode_uint(value, maximum):
    require(re.fullmatch(UINT, value) is not None)
    return number(int(value), maximum)


def validate_manifest(raw):
    require(len(raw) <= METADATA)
    value = json.loads(raw)
    require(type(value) is dict and list(value) == ["version", "repository", "branch", "head", "issue", "files"])
    require(type(value["version"]) is int and value["version"] == 1)
    require(value["repository"] == "msoecsse/graider" and value["branch"] == "remote-course-v2")
    require(type(value["head"]) is str and re.fullmatch(r"[a-f0-9]{40}", value["head"]) is not None)
    require(type(value["issue"]) is int and 0 < value["issue"] <= 9007199254740991)
    files = value["files"]
    require(type(files) is list and 0 < len(files) <= FILES)
    entries = {}
    aliases = {}
    previous = ""
    total = 0
    directory_count = 0
    for item in files:
        require(type(item) is dict and list(item) == ["path", "mode", "size", "sha256"])
        name = item["path"]
        require(type(name) is str and 0 < len(name) <= PATH_BYTES and re.fullmatch(r"[A-Za-z0-9_./-]+", name) is not None)
        require(name > previous and item["mode"] in ("100644", "100755"))
        size = number(item["size"], FILE)
        require(type(item["sha256"]) is str and re.fullmatch(HASH, item["sha256"]) is not None)
        require(size != 0 or item["sha256"] == EMPTY)
        parts = name.split("/")
        for part in parts:
            require(part not in ("", ".", "..") and not part.endswith(".") and RESERVED.fullmatch(part) is None and PROTECTED.fullmatch(part) is None and re.match(r"\.env(?:\.|$)", part, re.I) is None)
        for count in range(1, len(parts) + 1):
            prefix = "/".join(parts[:count])
            kind = "file" if count == len(parts) else "directory"
            require(prefix.lower() not in aliases or aliases[prefix.lower()] == prefix)
            require(prefix not in entries or entries[prefix]["type"] == kind)
            if prefix not in entries:
                mode = "0755" if kind == "directory" or item["mode"] == "100755" else "0644"
                entries[prefix] = dict(path=prefix, type=kind, mode=mode, size=size if kind == "file" else 0, links=1 if kind == "file" else 0)
                aliases[prefix.lower()] = prefix
                directory_count += kind == "directory"
        total += size
        previous = name
    require(total <= TOTAL and directory_count <= DIRECTORIES and canonical(value) == raw)
    inventory = canonical([entries[name] for name in sorted(entries)])
    require(len(inventory) <= METADATA)
    controls = 6
    chunks = lambda size: (size + CHUNK - 1) // CHUNK
    require(chunks(len(raw)) + 2 * chunks(total) + 2 * chunks(len(inventory)) + controls <= OPERATIONS)
    return value, entries, inventory, total


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


class Receiver:
    def __init__(self, root):
        self.root = root
        self.root_identity = os.lstat(root)
        require(stat.S_ISDIR(self.root_identity.st_mode) and not stat.S_ISLNK(self.root_identity.st_mode))
        self.state = "start"
        self.sequence = 0
        self.session = None
        self.manifest_raw = bytearray()
        self.offset = 0
        self.manifest = None
        self.entries = {}
        self.inventory = b""
        self.file_index = 0
        self.file_offset = 0
        self.file = None
        self.file_hash = hashlib.sha256()
        self.stream_hash = hashlib.sha256()
        self.previous = (0, EMPTY)
        self.inventory_index = 0
        self.wire = 0
        self.peak_workspace = 0
        self.peak_inodes = 0

    def account(self, count):
        self.wire += count
        require(self.wire <= WIRE)

    def workspace(self):
        if hasattr(os, "statvfs"):
            info = os.statvfs(self.root)
            self.peak_workspace = max(self.peak_workspace, (info.f_blocks - info.f_bfree) * info.f_frsize)
            self.peak_inodes = max(self.peak_inodes, info.f_files - info.f_ffree)

    def parent(self, name):
        # Descriptor-relative, no-follow component traversal. Imported names cannot
        # select a root or make a symlink/reparse-point part of an open operation.
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        fd = os.open(self.root, flags)
        root = os.fstat(fd)
        require((root.st_dev, root.st_ino) == (self.root_identity.st_dev, self.root_identity.st_ino))
        try:
            for part in name.split("/")[:-1]:
                next_fd = os.open(part, flags, dir_fd=fd)
                os.close(fd)
                fd = next_fd
                require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o755)
            return fd
        except BaseException:
            os.close(fd)
            raise

    def open_file(self, item, writing):
        parent = self.parent(item["path"])
        try:
            flags = (os.O_WRONLY | os.O_CREAT | os.O_EXCL) if writing else os.O_RDONLY
            fd = os.open(item["path"].split("/")[-1], flags | os.O_NOFOLLOW, 0o600, dir_fd=parent)
        finally:
            os.close(parent)
        try:
            info = os.fstat(fd)
            require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1)
            if not writing:
                require(info.st_size == item["size"] and stat.S_IMODE(info.st_mode) == int(item["mode"][-3:], 8))
            return os.fdopen(fd, "wb" if writing else "rb", buffering=0)
        except BaseException:
            os.close(fd)
            raise

    def create_directories(self):
        for name, entry in sorted(self.entries.items()):
            if entry["type"] == "directory":
                parent = self.parent(name)
                try:
                    os.mkdir(name.split("/")[-1], mode=0o755, dir_fd=parent)
                finally:
                    os.close(parent)

    def next_file(self, writing):
        files = self.manifest["files"]
        while self.file_index < len(files) and self.file is None:
            item = files[self.file_index]
            self.file = self.open_file(item, writing)
            self.file_hash = hashlib.sha256()
            self.file_offset = 0
            if item["size"] == 0:
                self.close_file(writing)

    def close_file(self, writing):
        item = self.manifest["files"][self.file_index]
        require(self.file_offset == item["size"] and self.file_hash.hexdigest() == item["sha256"])
        if writing:
            os.fchmod(self.file.fileno(), int(item["mode"][-3:], 8))
        info = os.fstat(self.file.fileno())
        require(info.st_size == item["size"] and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == int(item["mode"][-3:], 8))
        self.file.close()
        self.file = None
        self.file_index += 1

    def data(self, data):
        self.stream_hash.update(data)
        consumed = 0
        self.next_file(True)
        while consumed < len(data):
            require(self.file is not None)
            item = self.manifest["files"][self.file_index]
            count = min(item["size"] - self.file_offset, len(data) - consumed)
            fragment = data[consumed:consumed + count]
            require(self.file.write(fragment) == count)
            self.file_hash.update(fragment)
            self.file_offset += count
            consumed += count
            if self.file_offset == item["size"]:
                self.close_file(True)
                self.next_file(True)

    def readback(self, length):
        result = bytearray()
        self.next_file(False)
        while len(result) < length:
            require(self.file is not None)
            item = self.manifest["files"][self.file_index]
            count = min(item["size"] - self.file_offset, length - len(result))
            before = identity(os.fstat(self.file.fileno()))
            data = self.file.read(count)
            require(len(data) == count and identity(os.fstat(self.file.fileno())) == before)
            result.extend(data)
            self.file_hash.update(data)
            self.file_offset += count
            if self.file_offset == item["size"]:
                require(self.file.read(1) == b"")
                self.close_file(False)
                self.next_file(False)
        self.stream_hash.update(result)
        return bytes(result)

    def exact_inventory(self, empty=False):
        actual = {}
        def walk(directory, prefix):
            directories = []
            with os.scandir(directory) as children:
                for child in children:
                    require(len(actual) < FILES + DIRECTORIES)
                    name = prefix + child.name
                    require(name in self.entries and not empty)
                    expected = self.entries[name]
                    info = child.stat(follow_symlinks=False)
                    require(not stat.S_ISLNK(info.st_mode))
                    kind = "directory" if stat.S_ISDIR(info.st_mode) else "file"
                    require(kind == expected["type"] and (kind == "directory" or stat.S_ISREG(info.st_mode)))
                    require(stat.S_IMODE(info.st_mode) == int(expected["mode"], 8))
                    if kind == "file":
                        require(info.st_nlink == 1 and info.st_size == expected["size"])
                    actual[name] = dict(path=name, type=kind, mode=expected["mode"], size=info.st_size if kind == "file" else 0, links=info.st_nlink if kind == "file" else 0)
                    if kind == "directory":
                        directories.append((child, name, info))
                    else:
                        require(identity(child.stat(follow_symlinks=False)) == identity(info))
            # Close the iterator before descent: valid 240-byte paths can be
            # deeper than the fixed descriptor ceiling. Directory worklists are
            # bounded by admitted/observed entries, not by guest declarations.
            for child, name, info in directories:
                walk(child.path, name + "/")
                require(identity(child.stat(follow_symlinks=False)) == identity(info))
        walk(self.root, "")
        projection = canonical([actual[name] for name in sorted(actual)])
        require(projection == (b"[]" if empty else self.inventory))
        return projection

    def ack(self, phase, offset, value):
        return f"GRT1 {self.session} {self.sequence} ACK {phase} {offset} {value}\n".encode("ascii")

    def previous_ack(self, fields):
        require(len(fields) == 2 and fields == [str(self.previous[0]), self.previous[1]])

    def handle(self, wire):
        try:
            self.account(len(wire))
            require(self.state not in ("failed", "finished") and self.sequence < OPERATIONS)
            require(0 < len(wire) <= FRAME and wire.endswith(b"\n") and b"\n" not in wire[:-1] and b"\r" not in wire)
            text = wire[:-1].decode("ascii")
            fields = text.split(" ")
            require(len(fields) >= 4 and fields[0] == "GRT1" and re.fullmatch(r"[a-f0-9]{32}", fields[1]) is not None)
            require(fields[2] == str(self.sequence))
            if self.session is None:
                self.session = fields[1]
            require(fields[1] == self.session)
            operation = fields[3]
            arguments = fields[4:]
            match = DATA.fullmatch(" ".join(fields[3:]))
            if match:
                phase, offset, length, chunk_digest, encoded = match.groups()
                require(self.state == ("manifest" if phase == "M" else "data") and phase in ("M", "D"))
                require(len(wire) - len(encoded) <= HEADER)
                size = self.manifest_size if phase == "M" else self.data_size
                require(offset == str(self.offset) and length == str(min(CHUNK, size - self.offset)))
                data = base64.b64decode(encoded, validate=True)
                require(0 < len(data) <= CHUNK and str(len(data)) == length and base64.b64encode(data).decode("ascii") == encoded and digest(data) == chunk_digest)
                if phase == "M":
                    self.manifest_raw.extend(data)
                else:
                    self.data(data)
                self.offset += len(data)
                result = self.ack(phase, self.offset, chunk_digest)
            else:
                require(len(wire) <= HEADER)
                result = self.control(operation, arguments)
            self.account(len(result))
            self.sequence += 1
            return result
        except BaseException:
            self.state = "failed"
            if self.file is not None:
                self.file.close()
                self.file = None
            raise

    def control(self, operation, arguments):
        if operation == "START":
            require(self.state == "start" and len(arguments) == 4)
            self.manifest_size = decode_uint(arguments[0], METADATA)
            self.data_size = decode_uint(arguments[2], TOTAL)
            self.manifest_digest, self.data_digest = arguments[1], arguments[3]
            require(self.manifest_size > 0 and re.fullmatch(HASH, self.manifest_digest) is not None and re.fullmatch(HASH, self.data_digest) is not None)
            require(self.data_size != 0 or self.data_digest == EMPTY)
            self.exact_inventory(empty=True)
            self.state = "manifest"
            return self.ack("START", 0, digest(b"[]"))
        if operation == "SEAL_MANIFEST":
            require(self.state == "manifest" and not arguments and self.offset == self.manifest_size and digest(self.manifest_raw) == self.manifest_digest)
            self.manifest, self.entries, self.inventory, total = validate_manifest(bytes(self.manifest_raw))
            require(total == self.data_size)
            self.manifest_raw.clear()
            self.create_directories()
            self.offset = 0
            self.state = "data"
            return self.ack("SEAL_MANIFEST", self.manifest_size, self.manifest_digest)
        if operation == "SEAL_DATA":
            require(self.state == "data" and not arguments and self.offset == self.data_size and self.stream_hash.hexdigest() == self.data_digest)
            self.next_file(True)
            require(self.file is None and self.file_index == len(self.manifest["files"]))
            self.inventory = self.exact_inventory()
            self.workspace()
            self.state = "inventory-before"
            self.offset = 0
            return self.ack("SEAL_DATA", self.data_size, self.data_digest)
        if operation == "GET":
            require(self.state in ("inventory-before", "readback", "inventory-after") and len(arguments) == 5)
            phase, offset, length, prior_offset, prior_digest = arguments
            self.previous_ack([prior_offset, prior_digest])
            require(phase == ("R" if self.state == "readback" else "I") and offset == str(self.offset))
            size = self.data_size if phase == "R" else len(self.inventory)
            count = min(CHUNK, size - self.offset)
            require(count > 0 and length == str(count))
            data = self.readback(count) if phase == "R" else self.inventory[self.offset:self.offset + count]
            result = f"GRT1 {self.session} {self.sequence} {phase} {self.offset} {count} {digest(data)} ".encode("ascii") + base64.b64encode(data) + b"\n"
            self.offset += count
            self.previous = (self.offset, digest(data))
            return result
        if operation == "BEGIN_READBACK":
            require(self.state == "inventory-before" and self.offset == len(self.inventory))
            self.previous_ack(arguments)
            self.state = "readback"
            self.offset = 0
            self.file_index = 0
            self.stream_hash = hashlib.sha256()
            self.previous = (0, EMPTY)
            self.next_file(False)
            return self.ack("BEGIN_READBACK", 0, EMPTY)
        if operation == "END_READBACK":
            require(self.state == "readback" and self.offset == self.data_size and self.stream_hash.hexdigest() == self.data_digest and self.file is None and self.file_index == len(self.manifest["files"]))
            self.previous_ack(arguments)
            self.inventory = self.exact_inventory()
            self.workspace()
            self.state = "inventory-after"
            self.offset = 0
            self.previous = (0, EMPTY)
            return self.ack("END_READBACK", self.data_size, self.data_digest)
        if operation == "FINISH":
            require(self.state == "inventory-after" and self.offset == len(self.inventory))
            self.previous_ack(arguments)
            self.exact_inventory()
            self.state = "finished"
            usage = guest_usage(self)
            return self.ack("FINISH", self.manifest_size, self.manifest_digest).rstrip(b"\n") + b" " + " ".join(str(item) for item in usage).encode("ascii") + b"\n"
        raise ValueError("GRT1 unknown control")


def guest_usage(receiver):
    import resource
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform == "darwin":
        rss //= 1024
    memory = {}
    if sys.platform == "linux":
        with open("/proc/meminfo", "rb") as info:
            raw = info.read(16384)
        for line in raw.splitlines():
            key, value, *_ = line.split()
            if key in (b"MemTotal:", b"MemAvailable:"):
                memory[key] = int(value)
    return (rss, receiver.peak_workspace, receiver.peak_inodes, memory.get(b"MemTotal:", 0), memory.get(b"MemAvailable:", 0))


def serve(receiver, incoming, outgoing):
    ready = f"GRT1 READY {PROFILE}\n".encode("ascii")
    receiver.account(len(ready))
    outgoing.write(ready)
    outgoing.flush()
    active = True
    while active:
        wire = incoming.readline(FRAME + 1)
        require(wire != b"")
        result = receiver.handle(wire)
        outgoing.write(result)
        outgoing.flush()
        # Wait for shutdown after FINISH. No extra request or diagnostic can be
        # acknowledged; the host independently reaps this whole VM.
        active = receiver.state != "finished"
    trailing = incoming.read(1)
    receiver.account(len(trailing))
    require(trailing == b"")


if __name__ == "__main__":
    try:
        import resource
        require(len(sys.argv) == 1 and os.getuid() == 65534 and os.getcwd() == "/work")
        ADDRESS_SPACE = 67108864
        CPU_SECONDS = 600
        OPEN_FILES = 32
        resource.setrlimit(resource.RLIMIT_AS, (ADDRESS_SPACE, ADDRESS_SPACE))
        resource.setrlimit(resource.RLIMIT_CPU, (CPU_SECONDS, CPU_SECONDS))
        resource.setrlimit(resource.RLIMIT_NOFILE, (OPEN_FILES, OPEN_FILES))
        os.umask(0o022)
        serve(Receiver("/work"), sys.stdin.buffer, sys.stdout.buffer)
    except BaseException:
        # No raw exceptions, paths, repository bytes or diagnostics cross serial.
        sys.exit(1)
