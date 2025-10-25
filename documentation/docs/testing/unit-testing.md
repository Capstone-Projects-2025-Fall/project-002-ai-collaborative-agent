---
sidebar_position: 1
---
# Unit tests

## Library Explanation: 
We chose the Vitest library for our unit tests because it aligns with typescript extension. Some key functions include:

_Mock:_ to avoid touching actual file systems this is set in place, this creates a fake version of the module

_Describe:_ Normal print statements explaining what is happening

_Expect:_ The actual test where it makes sure everything is working properly

## Execution of Tests:

_loadInitialData()_: Loads data from .aiCollabData.json and returns structured info
	
  Dependencies: fs.promises.readFile

_saveInitialData(data)_ : Saves Json to .aiCollabData.json
	
  Dependencies: fs.promises.writeFile
              
## Running the Tests:

```
npm i -D @vitest/coverage-v8
npx vitest run --coverage
```
## QA Testing Table

ID  | Requirement | Test Steps | Expected Result 
--- | --- | --- | ---  
1 | The main panel must be accessible via VSCode UI. | Click on the bottom left corner that is called ‘AI Agent’ | The "AI Collab Agent” webview opens in an editor tab.
2 | User receives feedback on success. | Add a team member, input their data and click save. Add that team member to a project and click generate prompt button. | The user gets a green pop up that lets them know their prompt was generated and said prompt is saved on a txt file.
3 | User receives feedback on failure. | Generate a project with out team members.| User gets a red pop up that lets them know the project couldn’t generate a prompt. 
4 | User logs in using Oauth with either Google or Github. | Have an internet connection, Run the extension, get prompted to the login page, press either log in with Google or Github, on the respective page select an active account, return to the VS Code to see main page. | After login in with those platforms, there should be a local html page that processes the request and tells the user their authentication was successful. 
5 | Code should be analyzed | When the user saves the file or waits for 1 minute interval. | Users get a pop up panel that shows the analyzed results of the code in that folder that the file belongs to.




