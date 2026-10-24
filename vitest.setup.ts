import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Without vitest globals, testing-library can't register its own cleanup.
afterEach(cleanup);
