---
sidebar_position: 3
---
# Acceptance test

Demonstration of all of the functional and non-functional requirements. This can be a combination of automated tests derived from the use-cases (user stories) and manual tests with recorded observation of the results.

### Tests Mock Data

```
const mockData = {
        users: [{ id: 1, name: "Alex" }],
        projects: [{ id: 101, name: "Test Project" }],
        promptCount: 5,
      };
```

### Tests to check if the result is what we expect

expect(result.users).toHaveLength(1);

expect(result.projects).toHaveLength(1);

expect(result.promptCount).toBe(5);


### Tests Failed Mock Data

```
const mockData = {
        users: [{ id: 1, name: "John", name: “Alex” }],
        projects: [{ id: 111, name: "Project Test" }],
        promptCount: 10,
      };
```

### Tests to check if the result is what we expect

expect(result.users).toHaveLength(1);

expect(result.projects).toHaveLength(1);

expect(result.promptCount).toBe(5);

## QA Testing Table

ID  | Requirement | Test Steps | Expected Result 
--- | --- | --- | ---  
1 | The main panel must be accessible via VSCode UI. | Click on the bottom left corner that is called ‘AI Agent’ | The "AI Collab Agent” webview opens in an editor tab.
2 | User receives feedback on success. | Add a team member, input their data and click save. Add that team member to a project and click generate prompt button. | The user gets a green pop up that lets them know their prompt was generated and said prompt is saved on a txt file.
3 | User receives feedback on failure. | Generate a project with out team members.| User gets a red pop up that lets them know the project couldn’t generate a prompt. 
4 | User logs in using Oauth with either Google or Github. | Have an internet connection, Run the extension, get prompted to the login page, press either log in with Google or Github, on the respective page select an active account, return to the VS Code to see main page. | After login in with those platforms, there should be a local html page that processes the request and tells the user their authentication was successful. 
5 | Code should be analyzed | When the user saves the file or waits for 1 minute interval. | Users get a pop up panel that shows the analyzed results of the code in that folder that the file belongs to.
