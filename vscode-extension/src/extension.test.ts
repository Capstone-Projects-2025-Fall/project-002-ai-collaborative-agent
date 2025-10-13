// extension.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs/promises";
import * as vscode from "vscode";
import * as path from "path";

// We must import the functions we want to test
import { loadInitialData, saveInitialData } from "./extension"; // Adjust path if needed

// --- Mocking Section ---
// We tell Vitest: "anytime code asks for the 'vscode' module, give them our fake version"
vi.mock("vscode", () => {
  // A fake workspace with a fake folder path
  const mockWorkspace = {
    workspaceFolders: [
      {
        uri: {
          fsPath: "/mock/workspace", // A pretend folder
        },
      },
    ],
  };

  // A fake window object with a spy on showErrorMessage
  const mockWindow = {
    showErrorMessage: vi.fn(), // vi.fn() creates a "spy" we can check later
    showInformationMessage: vi.fn(),
  };

  // Return the complete fake vscode API
  return {
    workspace: mockWorkspace,
    window: mockWindow,
    // Add any other vscode properties your code might need here
  };
});

// We also mock the 'fs/promises' module to avoid touching the actual file system
vi.mock("fs/promises");

// --- Test Suite ---
describe("Data Handling Logic", () => {
  // This runs before each 'it' block, resetting our mocks
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test suite for the loadInitialData function
  describe("loadInitialData", () => {
    it("should load and parse data when the file exists", async () => {
      // Arrange: Setup our test scenario
      const mockData = {
        users: [{ id: 1, name: "Alex" }],
        projects: [{ id: 101, name: "Test Project" }],
        promptCount: 5,
      };
      // Make the mocked fs.readFile return our fake data
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockData));

      // Act: Run the function we are testing
      const result = await loadInitialData();

      // Assert: Check if the result is what we expect
      expect(result.users).toHaveLength(1);
      expect(result.projects).toHaveLength(1);
      expect(result.promptCount).toBe(5);
      // It should also ensure 'selectedMemberIds' is an array
      expect(result.projects[0].selectedMemberIds).toEqual([]);
    });

    it("should return a default state if the data file does not exist", async () => {
      // Arrange: Make the mocked fs.readFile throw an error (like a missing file)
      vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));

      // Act: Run the function
      const result = await loadInitialData();

      // Assert: Check that we get the default empty object
      expect(result).toEqual({
        users: [],
        projects: [],
        promptCount: 0,
      });
    });
  });

  // Test suite for the saveInitialData function
  describe("saveInitialData", () => {
    it("should call fs.writeFile with the correct path and stringified data", async () => {
      // Arrange
      const dataToSave = { users: [{ id: 2, name: "Beth" }] };
      const expectedPath = path.join("/mock/workspace", ".aiCollabData.json");
      const expectedJsonString = JSON.stringify(dataToSave, null, 2);

      // Act
      await saveInitialData(dataToSave);

      // Assert
      // Check if our fake writeFile was called correctly
      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedPath,
        expectedJsonString,
        "utf-8"
      );
    });
  });
});
