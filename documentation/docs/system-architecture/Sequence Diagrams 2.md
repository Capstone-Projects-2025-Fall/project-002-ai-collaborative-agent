---
sidebar_position: 5
---
# Sequence Diagrams
<!--

## Use Case 1: Team Creation & Join Workflow
![Use Case 1 Sequence Diagram](./usecase1-sequence.png)
-->

# Create Team & Define Problem

This diagram illustrates the sequence of interactions required to fulfill the "Create Team & Define Problem" use case. The process begins when a User (acting as a student) initiates the "Open 'New Team'" action within the VS Code Extension.

```mermaid
sequenceDiagram 
  participant U as User 
  participant X as VS Code Extension 
  participant A as Backend API 
  participant D as DB 

  U->>X: Open "New Team" 
  X->>A: POST /teams {name, attrs} 
  A->>D: insert Team, Member 
  D-->>A: ok 
  A-->>X: 201 {teamId} 
  X-->>U: Show team dashboard
```

***

# Define Project Specifications

This diagram illustrates the flow of actions involved when a user defines project specifications within the Collaborative Agent system. This activity is a crucial part of the "Create Team & Define Problem" use case, or a subsequent step in project setup.

```mermaid
sequenceDiagram 
  participant U as User 
  participant X as VS Code Extension 
  participant A as Backend API 
  participant D as DB 
  
  U->>X: Enter project name/desc 
  X->>A: POST /projects 
  A->>D: insert Project 
  U->>X: Upload requirements file/link 
  X->>A: POST /projects/{id}/requirements 
  A->>D: store file metadata 
  A-->>X: 200 

```

***

# Allocate Tasks to Members (Agent Delegation)

This diagram illustrates the process where the AI Agent automatically delegates coding tasks among team members, corresponding to your "Allocate Tasks to Members" use case.

```mermaid
sequenceDiagram 
  participant X as VS Code Extension 
  participant A as Backend API 
  participant L as LLM Adapter 
 participant D as DB 
  participant R as Real-time 

  X->>A: POST /tasks/auto-allocate {projectId} 
  A->>D: fetch members, skills, reqs 
  A->>L: delegate(prompt with goals+skills) 
  L-->>A: task list with assignees 
  A->>D: upsert tasks+assignments 
  A->>R: publish task.created / assigned 
  A-->>X: 200 {tasks} 

```

***

# Real-time Status Updates

This diagram illustrates how real-time status updates are communicated between team members, a key aspect of several use cases, including "Allocate Tasks to Members" and "Simultaneous Coding Session."

```mermaid
  sequenceDiagram 
    participant X1 as Dev A Extension 
    participant X2 as Dev B Extension 
    participant R as Real-time 
    participant A as Backend 
  
    X1->>R: connect(token), subscribe(project) 
    X2->>R: connect(token), subscribe(project) 
    R-->>X1: presence {B online} 
    X1->>A: PATCH /tasks/{id} status=in_progress 
    A->>R: publish task.updated 
    R-->>X2: task.updated 
```

***

# Request Peer Review of Code

This diagram illustrates the process for initiating a peer code review. The flow begins when a Dev (Developer), through the VS Code Extension, issues a "Request review on PR" action. This could involve selecting a specific code change, file, or branch to be reviewed.

```mermaid
  sequenceDiagram 
  participant Dev 
  participant X as VS Code Extension 
  participant A as Backend API 
  participant D as DB 
  participant R as Real-time 
  

  Dev->>X: Request review on PR#123 
  X->>A: POST /reviews/request {diff, refs} 
  A->>D: insert Review 
  A->>R: publish review.created 
  R-->>X: notify assignee(s) 
 
```

***

# Agent Provides Real-Time Feedback

This diagram illustrates the process where the AI agent provides instant, real-time feedback and suggestions to a student while they are coding, directly addressing your "Agent Provides Real-Time Feedback" use case.

```mermaid
  sequenceDiagram 
  participant X as VS Code Extension  
  participant A as Backend API
  participant L as LLM Adapter
  participant R as Real-time 

  X->>A: POST /agent/hint {file, cursor, context} 
  A->>L: srsSuggest(...) 
  L-->>A: suggestion {snippet, rationale} 
  A->>R: publish agent.suggestion 
  R-->>X: agent.suggestion 
```

***

# Agent Suggests Improvements Based on Peer Review

This diagram illustrates how the AI agent processes peer review feedback and generates actionable suggestions for the code author, directly addressing your "Agent Suggests Improvements Based on Peer Review" use case.

```mermaid
  sequenceDiagram 
  participant A as Backend API
  participant L as LLM Adapter
  participant D as DB  
  participant R as Real-time  
  participant X as VS Code Extension

  A->>D: fetch review comments 
  A->>L: summarize + action items 
  L-->>A: suggestions[] 
  A->>D: store suggestions 
  A->>R: publish agent.suggestion 
  R-->>X: show next actions 
```

***

# Finalize and Submit Project Work

This diagram illustrates the process for a team to finalize and submit their project, directly addressing your "Finalize and Submit Project Work" use case.

```mermaid
  sequenceDiagram 
  participant U as User 
  participant X as VS Code Extension
  participant A as Backend API
  participant D as DB  
  
  U->>X: Click "Finalize" 
  X->>A: POST /projects/{id}/finalize 
  A->>D: mark project status=final 
  A-->>X: 200 {artifact links} 
  X-->>U: Confirmation + artifacts 
```

***
