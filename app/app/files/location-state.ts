import { randomUUID } from "crypto";
import type {
  FileEntry,
  FileListResponse,
  FileRootInfo,
} from "@/lib/types";

/**
 * Canonical location within the Files UI.
 * root + segments uniquely identify a browsable location.
 * requestId tracks the sequence order for stale-response rejection.
 */
export type FilesLocation = Readonly<{
  root: string; // Root ID, empty string means roots view
  segments: readonly string[]; // Normalized path segments
  requestId: string; // UUID to sequence requests and detect stale responses
}>;

/**
 * Full state managed by FilesReducer.
 */
export type FilesState = Readonly<{
  // Canonical location state
  location: FilesLocation;
  pendingLocation: FilesLocation | null; // In-flight request location (for detecting stale responses)

  // Data fetched from server
  roots: readonly FileRootInfo[];
  entries: readonly FileEntry[];

  // Error state
  rootsError: string | null;
  entriesError: string | null;

  // Loading state
  loadingRoots: boolean;
  loadingEntries: boolean;

  // UI state for multi-select
  multiSelectMode: boolean;
  selectedFilePaths: readonly string[];
  downloadingSelection: boolean;
}>;

/**
 * Actions dispatched to drive state transitions.
 */
export type FilesAction =
  | { type: "REQUEST_ROOTS" }
  | { type: "ROOTS_LOADED"; roots: readonly FileRootInfo[] }
  | { type: "ROOTS_FAILED"; error: string }
  | { type: "SELECT_ROOT"; rootId: string }
  | { type: "NAVIGATE_TO_SEGMENTS"; segments: readonly string[] }
  | {
      type: "ENTRIES_LOADED";
      data: FileListResponse;
      requestId: string; // Must match pending location's requestId to accept
    }
  | { type: "ENTRIES_FAILED"; error: string }
  | { type: "TOGGLE_MULTISELECT" }
  | { type: "TOGGLE_SELECTED_FILE"; filePath: string }
  | { type: "CLEAR_SELECTED_FILES" }
  | { type: "SET_DOWNLOADING_SELECTION"; downloading: boolean }
  | { type: "BACK_TO_ROOTS" };

/**
 * Helper: create a new immutable location with a fresh UUID.
 */
export function createLocation(
  root: string,
  segments: readonly string[] = []
): FilesLocation {
  return {
    root,
    segments,
    requestId: randomUUID(),
  };
}

/**
 * Helper: get a stable string key for a location (for comparison).
 */
export function locationKey(loc: FilesLocation): string {
  return `${loc.root}:${loc.segments.join("/")}`;
}

/**
 * Helper: serialize location back to a path string.
 */
export function serializeLocationPath(loc: FilesLocation): string {
  return loc.segments.join("/");
}

/**
 * Helper: parse a path string into normalized segments.
 */
export function parsePathSegments(path: string): readonly string[] {
  if (!path) return [];
  return path.split("/").filter((s) => s.length > 0);
}

/**
 * Helper: join a base path and a name without double slashes.
 */
export function joinPath(base: string, name: string): string {
  if (!base) return name;
  return `${base.replace(/\/$/, "")}/${name}`;
}

/**
 * Helper: derive breadcrumb items from location and active root label.
 */
export function deriveBreadcrumbs(
  location: FilesLocation,
  activeRootLabel: string | undefined,
  onNavigate: (segments: readonly string[]) => void
): Array<{
  label: string;
  segments: readonly string[];
  onClick: () => void;
}> {
  const items: Array<{
    label: string;
    segments: readonly string[];
    onClick: () => void;
  }> = [];

  // Root chip
  if (location.root) {
    items.push({
      label: activeRootLabel ?? "Root",
      segments: [],
      onClick: () => onNavigate([]),
    });

    // Segment chips
    location.segments.forEach((segment, index) => {
      const upToHere = location.segments.slice(0, index + 1);
      items.push({
        label: segment,
        segments: upToHere,
        onClick: () => onNavigate(upToHere),
      });
    });
  }

  return items;
}

/**
 * Helper: reconcile a successful list response with pending location.
 * Returns true if response should be accepted, false if it's stale.
 */
export function shouldAcceptListResponse(
  response: FileListResponse,
  pendingLocation: FilesLocation | null,
  currentLocation: FilesLocation
): boolean {
  if (!pendingLocation) {
    // No pending request; use current location
    return response.root === currentLocation.root &&
      response.path === serializeLocationPath(currentLocation)
      ? true
      : false;
  }

  // Check if response matches the pending location (sequence guard)
  const responsePath = response.path ?? "";
  const pendingPath = serializeLocationPath(pendingLocation);
  const matches =
    response.root === pendingLocation.root && responsePath === pendingPath;

  return matches;
}

/**
 * Helper: reconcile a list response into a new canonical location.
 * Normalizes the server-returned path into segments.
 */
export function reconcileLocationFromResponse(
  response: FileListResponse,
  currentRequestId: string
): FilesLocation {
  return {
    root: response.root,
    segments: parsePathSegments(response.path ?? ""),
    requestId: currentRequestId,
  };
}

/**
 * Initial state for the reducer.
 */
export function createInitialState(): FilesState {
  return {
    location: createLocation(""),
    pendingLocation: null,
    roots: [],
    entries: [],
    rootsError: null,
    entriesError: null,
    loadingRoots: true,
    loadingEntries: false,
    multiSelectMode: false,
    selectedFilePaths: [],
    downloadingSelection: false,
  };
}

/**
 * Main reducer function: drives all state transitions.
 */
export function filesReducer(state: FilesState, action: FilesAction): FilesState {
  switch (action.type) {
    case "REQUEST_ROOTS":
      return {
        ...state,
        loadingRoots: true,
        rootsError: null,
      };

    case "ROOTS_LOADED":
      return {
        ...state,
        roots: action.roots,
        loadingRoots: false,
        rootsError: null,
        // Keep current root if still valid; otherwise reset to roots view
        location:
          state.location.root &&
          action.roots.some((r) => r.id === state.location.root)
            ? state.location
            : createLocation(""),
      };

    case "ROOTS_FAILED":
      return {
        ...state,
        loadingRoots: false,
        rootsError: action.error,
      };

    case "SELECT_ROOT": {
      const newLocation = createLocation(action.rootId);
      return {
        ...state,
        location: newLocation,
        pendingLocation: newLocation,
        multiSelectMode: false,
        selectedFilePaths: [],
        entries: [],
        entriesError: null,
        loadingEntries: true,
      };
    }

    case "NAVIGATE_TO_SEGMENTS": {
      const newLocation = createLocation(state.location.root, action.segments);
      return {
        ...state,
        location: newLocation,
        pendingLocation: newLocation,
        multiSelectMode: false,
        selectedFilePaths: [],
        entries: [],
        entriesError: null,
        loadingEntries: true,
      };
    }

    case "ENTRIES_LOADED": {
      // **Stale response detection**: ignore if request ID doesn't match pending
      if (
        !state.pendingLocation ||
        action.requestId !== state.pendingLocation.requestId
      ) {
        // Silently discard stale response
        return state;
      }

      // **Server-path reconciliation**: use response root/path as canonical truth
      const reconciledLocation = reconcileLocationFromResponse(
        action.data,
        action.requestId
      );

      return {
        ...state,
        location: reconciledLocation,
        pendingLocation: null,
        entries: action.data.entries ?? [],
        loadingEntries: false,
        entriesError: null,
      };
    }

    case "ENTRIES_FAILED":
      return {
        ...state,
        pendingLocation: null,
        loadingEntries: false,
        entriesError: action.error,
        entries: [],
      };

    case "TOGGLE_MULTISELECT":
      return {
        ...state,
        multiSelectMode: !state.multiSelectMode,
        ...(state.multiSelectMode ? { selectedFilePaths: [] } : {}), // Clear selection when exiting multi-select
      };

    case "TOGGLE_SELECTED_FILE": {
      const filePath = action.filePath;
      const alreadySelected = state.selectedFilePaths.includes(filePath);
      return {
        ...state,
        selectedFilePaths: alreadySelected
          ? state.selectedFilePaths.filter((p) => p !== filePath)
          : [...state.selectedFilePaths, filePath],
      };
    }

    case "CLEAR_SELECTED_FILES":
      return {
        ...state,
        selectedFilePaths: [],
      };

    case "SET_DOWNLOADING_SELECTION":
      return {
        ...state,
        downloadingSelection: action.downloading,
      };

    case "BACK_TO_ROOTS":
      return {
        ...state,
        location: createLocation(""),
        pendingLocation: null,
        multiSelectMode: false,
        selectedFilePaths: [],
        entries: [],
        entriesError: null,
      };

    default:
      return state;
  }
}
