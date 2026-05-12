import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Redirect zellij socket lookups to a hermetic tempdir so backend tests don't
// collide with whatever zellij sessions ("default", "pier", ...) the developer
// is actively running under /var/z/contract_version_1.
process.env["PIER_ZELLIJ_SOCKET_DIR"] ??= mkdtempSync(join(tmpdir(), "pier-test-zellij-"));
