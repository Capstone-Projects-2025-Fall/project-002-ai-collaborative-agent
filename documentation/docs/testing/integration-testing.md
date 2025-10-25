---
sidebar_position: 2
---
# Integration tests

Tests to demonstrate each use-case based on the use-case descriptions and the sequence diagrams. External input should be provided via mock objects and results verified via mock objects. Integration tests should not require manual entry of data nor require manual interpretation of results.


## Tests for empty object as a default:

```
expect(result).toEqual({
        users: [],
        projects: [],
        promptCount: 0,
      });
```

## Integration Principles

1. External Inputs Mocked
- User interactions (dialogs, messages) are replaced with mocked vscode.window functions.
- File system operations use mocked fs/promises to avoid real disk access.
- The workspace environment is simulated through a mocked vscode.workspace object.

2. Results Verified via Mocks
- All side effects are captured and verified using vi.fn() spies.
- Assertions confirm that:
  - fs.readFile and fs.writeFile are called with correct arguments.
  - Correct UI messages (showInformationMessage, showErrorMessage) are triggered.
  - Data is transformed and returned properly.

3. Automation and Isolation
- Tests are fully automated and do not require manual input.
- Results are machine-verifiable using expect assertions.
- Mocks are cleared between test runs to ensure independence.

## Use-Case Coverage

**Use Case 1 – Load Stored Collaboration Data**
- Function: `loadInitialData()`
- Scenario: Loads `.aiCollabData.json` if it exists; otherwise, returns default empty structures.
- Verification:
   - Mocks `fs.readFile` returning JSON or throwing an error.
   -  Asserts correct object structure and defaults.

**Use Case 2 – Save Collaboration Data**
- Function: `saveInitialData(data)`
- Scenario: Saves workspace data to `.aiCollabData.json` in the root of the workspace folder.
- Verification:
  -  Asserts that `fs.writeFile` is called with correct path, encoding, and stringified content.

**Use Case 3 – Generate AI Prompt for Project**
- Function: `createPromptForProject(project, users)`
- Scenario: Builds an AI prompt including project details and selected team members’ skills.
- Verification:
  -   Confirms inclusion/exclusion of correct member info.
  -   Validates text content generation.

## Testing Methodology

Each integration test follows the logical flow from the corresponding sequence diagram:

1. User requests data load → triggers fs.readFile() → validates parsed output.
2. User modifies and saves → triggers fs.writeFile() → confirms correct save path and data.
3. User generates AI prompt → combines project and user info → verifies generated text content.

All interactions with VS Code and the filesystem are mocked, ensuring the tests run deterministically and independently of the user’s system.

## Outcome

- Demonstrates end-to-end integration of the extension’s core features.
- Provides automated verification of correct behavior under different scenarios.
- Confirms reliable communication between data logic, VS Code API layers, and UI event triggers.
- Requires no manual intervention — results are automatically verified through assertions.


It verifies that:
- User actions (load, save, generate) produce the correct system responses.
- Data flows correctly between components.
- The extension behaves predictably across all defined use-cases.

By mocking all external dependencies, the tests ensure fast, repeatable, and fully automated validation of the system’s behavior.

