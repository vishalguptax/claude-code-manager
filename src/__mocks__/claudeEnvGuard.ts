/**
 * Global test guard: no test may resolve Claude paths into the developer's
 * own Claude Code config dir through their shell.
 *
 * src/core/config.ts honours `CLAUDE_CONFIG_DIR` (and
 * `CLAUDE_SECURESTORAGE_CONFIG_DIR`) from the process environment. Suites
 * isolate themselves by redirecting `os.homedir()` to a temp dir, which a
 * developer's exported `CLAUDE_CONFIG_DIR` would bypass — sending fixture
 * writes into their real sessions and settings. Clearing both before any
 * suite loads keeps every suite on the default layout under its fake home;
 * suites that test the variables set them explicitly.
 */
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
