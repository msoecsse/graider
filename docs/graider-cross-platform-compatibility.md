## Cross-Platform Compatibility

Graider must support both of the following platforms as first-class production environments:

- **macOS on Apple Silicon (M-series, arm64)**
- **Windows 64-bit (x64)**

All new functionality must be designed, implemented, and tested for both platforms unless a requirement explicitly states otherwise.

Cross-platform compatibility is a requirement at implementation time, not a later packaging or release concern.

Implementations must not rely on platform-specific assumptions including:

- POSIX-only path separators or absolute-path formats;
- `/tmp`, `/private/tmp`, `/Users`, or other Unix-specific filesystem locations;
- macOS-specific filesystem semantics;
- POSIX executable-bit behavior where Git object/index semantics are intended;
- case-sensitive filesystem behavior;
- Unix-only symbolic-link behavior;
- ambient Git configuration or system Git availability;
- platform-specific canonical-path representations;
- assumptions about file locking, deletion timing, or temporary-directory cleanup;
- shell commands or utilities unavailable on one supported platform.

Use platform-neutral Node, Electron, Git, and filesystem APIs wherever possible. When platform-specific behavior is unavoidable, isolate it behind a narrow abstraction with explicit tests for each supported platform.

Security-sensitive filesystem comparisons must use consistent native filesystem canonicalization and must preserve exact-root, containment, symlink, and repository-identity protections on both platforms.

Git behavior must use Graider's bundled Git infrastructure rather than depend on system Git, GitHub CLI, shell configuration, or user-specific environment setup.

### Testing requirement

A feature is not considered complete merely because it passes on the developer's current platform.

For functionality that interacts with filesystems, Git, Electron main-process services, native packaging, or other platform-sensitive behavior:

- tests must use platform-semantic paths rather than POSIX-rendered strings;
- fixtures must not depend on ambient machine configuration;
- integration tests must account for legitimate Windows filesystem timing and locking behavior without hiding hangs or failures;
- macOS Apple Silicon and Windows x64 CI must remain green before the functionality is considered production-ready.

Platform-specific test skips require an explicit technical justification and must not be used simply to bypass incompatible implementation or fixture assumptions.

### Release targets

The initial production release targets are:

1. macOS Apple Silicon / arm64
2. Windows x64

Linux and other architectures are outside the initial production compatibility requirement unless added later.