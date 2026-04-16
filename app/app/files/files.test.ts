import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialState,
  createLocation,
  deriveBreadcrumbs,
  filesReducer,
  joinPath,
  locationKey,
  parsePathSegments,
  reconcileLocationFromResponse,
  serializeLocationPath,
  shouldAcceptListResponse,
  type FileListResponse,
} from "./location-state";

// ============================================================================
// Path Utility Tests
// ============================================================================

test("joinPath combines base and name without double slashes", () => {
  assert.equal(joinPath("folder1", "folder2"), "folder1/folder2");
});

test("joinPath strips trailing slash from base", () => {
  assert.equal(joinPath("folder1/", "folder2"), "folder1/folder2");
});

test("joinPath returns name only when base is empty", () => {
  assert.equal(joinPath("", "file.txt"), "file.txt");
});

test("serializeLocationPath returns empty string for empty segments", () => {
  const loc = createLocation("root1");
  assert.equal(serializeLocationPath(loc), "");
});

test("serializeLocationPath joins segments with slashes", () => {
  const loc = createLocation("root1", ["folder1", "folder2", "folder3"]);
  assert.equal(serializeLocationPath(loc), "folder1/folder2/folder3");
});

test("parsePathSegments splits path into segments and filters empty", () => {
  assert.deepEqual(parsePathSegments("folder1/folder2/folder3"), [
    "folder1",
    "folder2",
    "folder3",
  ]);
});

test("parsePathSegments filters empty segments from double slashes", () => {
  assert.deepEqual(parsePathSegments("folder1//folder2///folder3"), [
    "folder1",
    "folder2",
    "folder3",
  ]);
});

test("parsePathSegments returns empty array for empty or falsy path", () => {
  assert.deepEqual(parsePathSegments(""), []);
  assert.deepEqual(parsePathSegments("/"), []);
});

test("locationKey creates stable string key from location", () => {
  const loc = createLocation("root1", ["folder1", "folder2"]);
  const key = locationKey(loc);
  assert.equal(key, "root1:folder1/folder2");
});

test("locationKey for root-only location", () => {
  const loc = createLocation("root1");
  assert.equal(locationKey(loc), "root1:");
});

// ============================================================================
// Breadcrumb Derivation Tests
// ============================================================================

test("deriveBreadcrumbs generates root chip when location has root", () => {
  const loc = createLocation("root1");
  const callbackCalls: Array<readonly string[]> = [];
  const breadcrumbs = deriveBreadcrumbs(loc, "My Root", (segments) => {
    callbackCalls.push(segments);
  });

  assert.equal(breadcrumbs.length, 1);
  assert.equal(breadcrumbs[0].label, "My Root");
  assert.deepEqual(breadcrumbs[0].segments, []);

  breadcrumbs[0].onClick();
  assert.deepEqual(callbackCalls[0], []);
});

test("deriveBreadcrumbs generates path chips from segments", () => {
  const loc = createLocation("root1", ["folder1", "folder2", "folder3"]);
  const breadcrumbs = deriveBreadcrumbs(loc, "My Root");

  assert.equal(breadcrumbs.length, 4);
  assert.equal(breadcrumbs[0].label, "My Root");
  assert.equal(breadcrumbs[1].label, "folder1");
  assert.equal(breadcrumbs[2].label, "folder2");
  assert.equal(breadcrumbs[3].label, "folder3");

  assert.deepEqual(breadcrumbs[0].segments, []);
  assert.deepEqual(breadcrumbs[1].segments, ["folder1"]);
  assert.deepEqual(breadcrumbs[2].segments, ["folder1", "folder2"]);
  assert.deepEqual(breadcrumbs[3].segments, ["folder1", "folder2", "folder3"]);
});

test("deriveBreadcrumbs uses 'Root' label when root label undefined", () => {
  const loc = createLocation("root1", ["folder1"]);
  const breadcrumbs = deriveBreadcrumbs(loc, undefined);

  assert.equal(breadcrumbs[0].label, "Root");
});

test("deriveBreadcrumbs returns empty array when location has no root", () => {
  const loc = createLocation("");
  const breadcrumbs = deriveBreadcrumbs(loc);

  assert.equal(breadcrumbs.length, 0);
});

// ============================================================================
// Response Reconciliation Tests
// ============================================================================

test("reconcileLocationFromResponse creates location from response", () => {
  const response: FileListResponse = {
    timestamp: new Date().toISOString(),
    root: "root1",
    path: "folder1/folder2",
    entries: [],
  };

  const loc = reconcileLocationFromResponse(response, "request-id-123");

  assert.equal(loc.root, "root1");
  assert.deepEqual(loc.segments, ["folder1", "folder2"]);
  assert.equal(loc.requestId, "request-id-123");
});

test("reconcileLocationFromResponse handles empty path", () => {
  const response: FileListResponse = {
    timestamp: new Date().toISOString(),
    root: "root1",
    path: "",
    entries: [],
  };

  const loc = reconcileLocationFromResponse(response, "req-id");

  assert.equal(loc.root, "root1");
  assert.deepEqual(loc.segments, []);
});

// ============================================================================
// Stale Response Detection Tests
// ============================================================================

test("shouldAcceptListResponse rejects when no pending location and path mismatch", () => {
  const response: FileListResponse = {
    timestamp: new Date().toISOString(),
    root: "root1",
    path: "folder1",
    entries: [],
  };
  const currentLocation = createLocation("root1");

  const accept = shouldAcceptListResponse(response, null, currentLocation);

  assert.equal(accept, false);
});

test("shouldAcceptListResponse accepts when no pending and path matches current", () => {
  const response: FileListResponse = {
    timestamp: new Date().toISOString(),
    root: "root1",
    path: "folder1",
    entries: [],
  };
  const currentLocation = createLocation("root1", ["folder1"]);

  const accept = shouldAcceptListResponse(response, null, currentLocation);

  assert.equal(accept, true);
});

test("shouldAcceptListResponse accepts when pending location matches response", () => {
  const response: FileListResponse = {
    timestamp: new Date().toISOString(),
    root: "root1",
    path: "folder1/folder2",
    entries: [],
  };
  const pendingLocation = createLocation("root1", ["folder1", "folder2"]);

  const accept = shouldAcceptListResponse(response, pendingLocation, createLocation(""));

  assert.equal(accept, true);
});

test("shouldAcceptListResponse rejects stale response when paths differ", () => {
  const response: FileListResponse = {
    timestamp: new Date().toISOString(),
    root: "root1",
    path: "folder1",
    entries: [],
  };
  const pendingLocation = createLocation("root1", ["folder1", "folder2"]);

  const accept = shouldAcceptListResponse(response, pendingLocation, createLocation(""));

  assert.equal(accept, false);
});

test("shouldAcceptListResponse rejects when root differs", () => {
  const response: FileListResponse = {
    timestamp: new Date().toISOString(),
    root: "root2",
    path: "folder1",
    entries: [],
  };
  const pendingLocation = createLocation("root1", ["folder1"]);

  const accept = shouldAcceptListResponse(response, pendingLocation, createLocation(""));

  assert.equal(accept, false);
});

// ============================================================================
// Reducer Tests
// ============================================================================

test("reducer initial state is empty and in roots view", () => {
  const state = createInitialState();

  assert.equal(state.location.root, "");
  assert.deepEqual(state.location.segments, []);
  assert.equal(state.pendingLocation, null);
  assert.deepEqual(state.roots, []);
  assert.deepEqual(state.entries, []);
  assert.equal(state.loadingRoots, true);
  assert.equal(state.multiSelectMode, false);
  assert.deepEqual(state.selectedFilePaths, []);
});

test("reducer SELECT_ROOT creates new location and clears selection", () => {
  const state = createInitialState();
  state.selectedFilePaths = ["file1.txt", "file2.txt"];
  state.multiSelectMode = true;

  const next = filesReducer(state, {
    type: "SELECT_ROOT",
    rootId: "root1",
  });

  assert.equal(next.location.root, "root1");
  assert.deepEqual(next.location.segments, []);
  assert.equal(next.pendingLocation?.root, "root1");
  assert.deepEqual(next.selectedFilePaths, []);
  assert.equal(next.multiSelectMode, false);
  assert.equal(next.loadingEntries, true);
});

test("reducer NAVIGATE_TO_SEGMENTS updates location and clears selection", () => {
  const state = createInitialState();
  state.location = createLocation("root1");
  state.pendingLocation = null;
  state.selectedFilePaths = ["file1.txt"];
  state.multiSelectMode = true;

  const next = filesReducer(state, {
    type: "NAVIGATE_TO_SEGMENTS",
    segments: ["folder1", "folder2"],
  });

  assert.equal(next.location.root, "root1");
  assert.deepEqual(next.location.segments, ["folder1", "folder2"]);
  assert.equal(next.pendingLocation?.root, "root1");
  assert.deepEqual(next.pendingLocation?.segments, ["folder1", "folder2"]);
  assert.deepEqual(next.selectedFilePaths, []);
  assert.equal(next.multiSelectMode, false);
  assert.equal(next.loadingEntries, true);
});

test("reducer ENTRIES_LOADED with matching request ID accepts response", () => {
  const state = createInitialState();
  const pendingLocation = createLocation("root1", ["folder1"]);
  state.location = pendingLocation;
  state.pendingLocation = pendingLocation;
  state.loadingEntries = true;

  const response: FileListResponse = {
    timestamp: new Date().toISOString(),
    root: "root1",
    path: "folder1",
    entries: [
      {
        name: "file1.txt",
        type: "file",
        sizeBytes: 1024,
        modifiedMs: Date.now(),
      },
    ],
  };

  const next = filesReducer(state, {
    type: "ENTRIES_LOADED",
    data: response,
    requestId: pendingLocation.requestId,
  });

  assert.equal(next.loadingEntries, false);
  assert.equal(next.pendingLocation, null);
  assert.equal(next.entries.length, 1);
  assert.equal(next.entries[0].name, "file1.txt");
  assert.equal(next.entriesError, null);
});

test("reducer ENTRIES_LOADED discards stale response when requestId mismatches", () => {
  const state = createInitialState();
  const pendingLocation = createLocation("root1", ["folder1"]);
  state.location = pendingLocation;
  state.pendingLocation = pendingLocation;
  state.loadingEntries = true;
  state.entries = [
    {
      name: "existing.txt",
      type: "file",
      sizeBytes: 1024,
      modifiedMs: Date.now(),
    },
  ];

  const response: FileListResponse = {
    timestamp: new Date().toISOString(),
    root: "root1",
    path: "folder1",
    entries: [
      {
        name: "stale-file.txt",
        type: "file",
        sizeBytes: 2048,
        modifiedMs: Date.now(),
      },
    ],
  };

  const next = filesReducer(state, {
    type: "ENTRIES_LOADED",
    data: response,
    requestId: "wrong-request-id",
  });

  // State should be unchanged
  assert.equal(next.entries.length, 1);
  assert.equal(next.entries[0].name, "existing.txt");
  assert.equal(next.loadingEntries, true);
  assert.equal(next.pendingLocation?.requestId, pendingLocation.requestId);
});

test("reducer ENTRIES_FAILED clears pending location and sets error", () => {
  const state = createInitialState();
  state.pendingLocation = createLocation("root1");
  state.loadingEntries = true;

  const next = filesReducer(state, {
    type: "ENTRIES_FAILED",
    error: "Network error",
  });

  assert.equal(next.pendingLocation, null);
  assert.equal(next.loadingEntries, false);
  assert.equal(next.entriesError, "Network error");
  assert.deepEqual(next.entries, []);
});

test("reducer BACK_TO_ROOTS returns to roots view and clears state", () => {
  const state = createInitialState();
  state.location = createLocation("root1", ["folder1", "folder2"]);
  state.entries = [
    {
      name: "file.txt",
      type: "file",
      sizeBytes: 1024,
      modifiedMs: Date.now(),
    },
  ];
  state.multiSelectMode = true;
  state.selectedFilePaths = ["file.txt"];

  const next = filesReducer(state, { type: "BACK_TO_ROOTS" });

  assert.equal(next.location.root, "");
  assert.deepEqual(next.location.segments, []);
  assert.equal(next.pendingLocation, null);
  assert.deepEqual(next.entries, []);
  assert.equal(next.multiSelectMode, false);
  assert.deepEqual(next.selectedFilePaths, []);
});

test("reducer TOGGLE_MULTISELECT toggles mode and clears selection on exit", () => {
  const state = createInitialState();
  state.multiSelectMode = false;
  state.selectedFilePaths = [];

  const next = filesReducer(state, { type: "TOGGLE_MULTISELECT" });

  assert.equal(next.multiSelectMode, true);
  assert.deepEqual(next.selectedFilePaths, []);

  const next2 = filesReducer(next, { type: "TOGGLE_MULTISELECT" });

  assert.equal(next2.multiSelectMode, false);
  assert.deepEqual(next2.selectedFilePaths, []);
});

test("reducer TOGGLE_SELECTED_FILE adds and removes paths", () => {
  const state = createInitialState();
  state.multiSelectMode = true;
  state.selectedFilePaths = [];

  const next = filesReducer(state, {
    type: "TOGGLE_SELECTED_FILE",
    filePath: "file1.txt",
  });

  assert.deepEqual(next.selectedFilePaths, ["file1.txt"]);

  const next2 = filesReducer(next, {
    type: "TOGGLE_SELECTED_FILE",
    filePath: "file2.txt",
  });

  assert.deepEqual(next2.selectedFilePaths, ["file1.txt", "file2.txt"]);

  const next3 = filesReducer(next2, {
    type: "TOGGLE_SELECTED_FILE",
    filePath: "file1.txt",
  });

  assert.deepEqual(next3.selectedFilePaths, ["file2.txt"]);
});

test("reducer CLEAR_SELECTED_FILES empties selection", () => {
  const state = createInitialState();
  state.selectedFilePaths = ["file1.txt", "file2.txt", "file3.txt"];

  const next = filesReducer(state, { type: "CLEAR_SELECTED_FILES" });

  assert.deepEqual(next.selectedFilePaths, []);
});

test("reducer ROOTS_LOADED preserves current root if still valid", () => {
  const state = createInitialState();
  state.location = createLocation("root1");
  state.roots = [{ id: "root1", label: "Root 1", path: "/path1" }];

  const next = filesReducer(state, {
    type: "ROOTS_LOADED",
    roots: [
      { id: "root1", label: "Root 1", path: "/path1" },
      { id: "root2", label: "Root 2", path: "/path2" },
    ],
  });

  assert.equal(next.location.root, "root1");
  assert.equal(next.roots.length, 2);
  assert.equal(next.loadingRoots, false);
});

test("reducer ROOTS_LOADED resets to roots view if current root invalid", () => {
  const state = createInitialState();
  state.location = createLocation("root1");
  state.roots = [{ id: "root1", label: "Root 1", path: "/path1" }];

  const next = filesReducer(state, {
    type: "ROOTS_LOADED",
    roots: [{ id: "root2", label: "Root 2", path: "/path2" }],
  });

  assert.equal(next.location.root, "");
  assert.deepEqual(next.location.segments, []);
});

test("reducer REQUEST_ROOTS sets loading state", () => {
  const state = createInitialState();
  state.loadingRoots = false;
  state.rootsError = "some error";

  const next = filesReducer(state, { type: "REQUEST_ROOTS" });

  assert.equal(next.loadingRoots, true);
  assert.equal(next.rootsError, null);
});

test("reducer SET_DOWNLOADING_SELECTION updates download state", () => {
  const state = createInitialState();
  state.downloadingSelection = false;

  const next = filesReducer(state, {
    type: "SET_DOWNLOADING_SELECTION",
    downloading: true,
  });

  assert.equal(next.downloadingSelection, true);
});
