"""Portable deterministic kernel double; NOT native filesystem/isolation evidence.

The real Receiver filesystem runs separately in pinned HVF experiments. This
double lets both native CI targets exercise the same Python protocol/data code
without pretending Windows exposes Linux openat/O_NOFOLLOW or mode semantics.
"""
import io
import stat
import types


class MemoryFile(io.BytesIO):
    def __init__(self, kernel, name):
        super().__init__(kernel.entries[name]["data"])
        self.kernel, self.name = kernel, name

    def fileno(self):
        return self

    def write(self, data):
        if self.kernel.capacity is not None and self.tell() + len(data) > self.kernel.capacity:
            raise OSError("synthetic ENOSPC")
        return super().write(data)

    def close(self):
        if not self.closed:
            self.kernel.entries[self.name]["data"] = self.getvalue()
        super().close()


class Kernel:
    O_RDONLY, O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW, O_DIRECTORY = 0, 1, 2, 4, 8, 16

    def __init__(self, root):
        self.root = root
        self.capacity = None
        self.open_directories = 0
        self.entries = {root: dict(data=b"", mode=stat.S_IFDIR | 0o700, links=1)}

    def name(self, name, parent):
        return name if parent is None else parent + "/" + name

    def info(self, name):
        entry = self.entries[name]
        return types.SimpleNamespace(st_dev=1, st_ino=name, st_mode=entry["mode"], st_nlink=entry["links"], st_size=len(entry["data"]), st_mtime_ns=0, st_ctime_ns=0)

    def lstat(self, name):
        return self.info(name)

    def open(self, name, flags, mode=0, dir_fd=None):
        name = self.name(name, dir_fd)
        if flags & self.O_CREAT:
            if name in self.entries:
                raise FileExistsError()
            self.entries[name] = dict(data=b"", mode=stat.S_IFREG | mode, links=1)
        entry = self.entries[name]
        if stat.S_ISLNK(entry["mode"]):
            raise OSError("no follow")
        if flags & self.O_DIRECTORY and not stat.S_ISDIR(entry["mode"]):
            raise OSError("not a directory")
        return name

    def close(self, fd):
        pass

    def fstat(self, fd):
        if isinstance(fd, MemoryFile):
            info = self.info(fd.name)
            info.st_size = len(fd.getvalue())
            return info
        return self.info(fd)

    def fchmod(self, fd, mode):
        self.entries[fd.name]["mode"] = stat.S_IFREG | mode

    def fdopen(self, fd, mode, buffering=0):
        return MemoryFile(self, fd)

    def mkdir(self, name, mode, dir_fd):
        name = self.name(name, dir_fd)
        if name in self.entries:
            raise FileExistsError()
        self.entries[name] = dict(data=b"", mode=stat.S_IFDIR | mode, links=1)

    def scandir(self, directory):
        kernel = self
        class Entries:
            def __enter__(self):
                kernel.open_directories += 1
                if kernel.open_directories > 32:
                    raise OSError("synthetic descriptor exhaustion")
                result = []
                for name in kernel.entries:
                    prefix = directory + "/"
                    if name.startswith(prefix) and "/" not in name[len(prefix):]:
                        result.append(types.SimpleNamespace(name=name[len(prefix):], path=name, stat=lambda follow_symlinks=False, name=name: kernel.info(name)))
                return result

            def __exit__(self, *args):
                kernel.open_directories -= 1
        return Entries()
