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





