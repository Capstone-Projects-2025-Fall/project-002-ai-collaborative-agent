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
```mermaid
sequenceDiagram
    box "VS Code"
    actor User as "Student User"
    participant Webview as "Extension UI (Webview)"
    participant Extension as "Extension Backend"
    end
    box "Backend & Services"
    participant Auth as "AuthService"
    participant DB as "DatabaseService"
    participant SB as "Supabase"
    end
    box "Other students join"
    actor Peer as "Other Student"
    end

    User->>Webview: Open "New Team"
    Webview->>Extension: Request authentication status
    Extension->>Auth: Check user session
    Auth-->>Extension: Auth result
    Extension-->>Webview: Update UI (login/signup or dashboard)

    alt User is authenticated
        User->>Webview: Enter team name & problem statement
        Webview->>Extension: Create project/team request
        Extension->>DB: Create Project (pass user as owner)
        DB->>SB: Insert project/record
        SB-->>DB: Project with invite_code
        DB-->>Extension: Return project (with invite_code)
        Extension-->>Webview: Show invite code
        Note right of User: Shares invite code with peers
    end

    Peer->>Webview: Enter invite code to join
    Webview->>Extension: Join project by invite code
    Extension->>DB: Add student as project member
    DB->>SB: Update project_members table
    SB-->>DB: Join confirmation
    DB-->>Extension: Join status
    Extension-->>Webview: Notify UI of join result

    Extension->>DB: Check member count
    alt Team is at required size
        DB-->>Extension: Mark team as active
        Extension-->>Webview: Notify all members, activate workspace
    else Waiting for more members
        Extension-->>Webview: Show waiting status
    end
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
```mermaid
sequenceDiagram
    box "VS Code"
    actor User as "Student User"
    participant Webview as "Extension UI (Webview)"
    participant Extension as "Extension Backend"
    end
    box "Backend & Services"
    participant DB as "DatabaseService"
    participant SB as "Supabase"
    end

    User->>Webview: Select "Define Project Specs"
    Webview->>User: Prompt for description, goals, requirements, etc.
    User->>Webview: Enter project specs (fills form)
    Webview->>Extension: Submit project specs (with project ID)
    Extension->>DB: Update project specs
    DB->>SB: Update project record in database
    SB-->>DB: Confirmation
    DB-->>Extension: Success (or error)
    alt Success
        Extension-->>Webview: Show success notification
        Webview->>User: Show spec summary/confirmation
    else Error
        Extension-->>Webview: Show error notification
        Webview->>User: Show error details
    end
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
```mermaid
sequenceDiagram
    box "VS Code"
    actor TeamLead as "Team Lead"
    participant Webview as "Extension UI"
    participant Extension as "Extension Backend"
    end
    box "AI & Backend"
    participant DB as "DatabaseService"
    participant AI as "AI Agent"
    end

    TeamLead->>Webview: Click "Allocate Tasks"
    Webview->>Extension: Request allocation
    Extension->>DB: Load team & project info
    DB-->>Extension: Return team/project data

    Extension->>AI: Send requirements, team info
    AI-->>Extension: Return task assignments per member

    Extension->>DB: Save allocated tasks
    DB-->>Extension: Confirmation

    Extension-->>Webview: Show assignments summary

    par Notify each member
        Extension-->>Webview: Display tasks to Member 1
        Extension-->>Webview: Display tasks to Member 2
        Extension-->>Webview: ...
    end
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
```mermaid
sequenceDiagram
    box "Team Clients"
      actor Alice as "Alice"
      actor Bob as "Bob"
      actor Carol as "Carol"
      participant ExtA as "Alice's Extension"
      participant ExtB as "Bob's Extension"
      participant ExtC as "Carol's Extension"
    end
    box "Backend & Sync"
      participant LiveShare as "LiveShare/Backend"
    end

    Alice->>ExtA: Make code edit / update task status
    ExtA->>LiveShare: Send update (status, code, etc.)
    LiveShare-->>ExtB: Broadcast update
    LiveShare-->>ExtC: Broadcast update

    ExtB->>Bob: Show Alice's status/code update
    ExtC->>Carol: Show Alice's status/code update

    par Bob/Carol also update status/tasks
      Bob->>ExtB: Mark task done / edit code
      ExtB->>LiveShare: Send update
      LiveShare-->>ExtA: Broadcast update
      LiveShare-->>ExtC: Broadcast update
      ExtA->>Alice: Show Bob's update
      ExtC->>Carol: Show Bob's update

      Carol->>ExtC: Change status / code
      ExtC->>LiveShare: Send update
      LiveShare-->>ExtA: Broadcast update
      LiveShare-->>ExtB: Broadcast update
      ExtA->>Alice: Show Carol's update
      ExtB->>Bob: Show Carol's update
    end
```
    Note over ExtA,ExtB,ExtC: Status/coding updates appear in all team members' UIs in real time.
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
```mermaid
sequenceDiagram
    box "VS Code"
      actor Dev as "Developer"
      participant Webview as "Extension UI/Webview"
      participant ExtMain as "Extension Backend"
    end
    box "Backend & Services"
      participant DB as "DatabaseService"
      participant Auth as "AuthService"
      participant PeerSuggest as "PeerSuggestionService"
      participant AI as "AI/Review Service"
      participant Notif as "Notification/PR Messaging"
    end

    Dev->>Webview: Click "Request review on PR"
    Webview->>ExtMain: Request code review (PR, file, or branch)
    ExtMain->>Auth: Validate user/session
    Auth-->>ExtMain: Current user/session

    ExtMain->>DB: Collect PR code diff and contributors
    DB-->>ExtMain: PR details, author, code context

    ExtMain->>PeerSuggest: Who is the best reviewer?
    PeerSuggest->>AI: Analyze code context, team profiles
    AI-->>PeerSuggest: Suggest best peer(s) for review
    PeerSuggest-->>ExtMain: Recommended reviewer(s)

    ExtMain->>Notif: Notify selected peer(s) for code review
    Notif-->>PeerSuggest: Delivery result

    ExtMain-->>Webview: Show "Review requested" status & who was notified

    par Peer responds
      Notif-->>Peer: "You have been requested to review PR/branch"
      Peer->>Webview: Accept/decline review (optional)
    end
```
    Note over Webview, Peer: The review request is tracked and UI updates with review status.
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
```mermaid
sequenceDiagram
    box "VS Code"
        actor Student as "Student"
        participant Editor as "Editor/Extension UI"
        participant ExtMain as "Extension Backend"
    end
    box "Backend & AI"
        participant AI as "AI Agent/Analyzer"
    end

    loop Continuous coding
        Student->>Editor: Edit, type, or save code
        Editor->>ExtMain: Notify of change/error/save
        ExtMain->>AI: Send code context for analysis
        AI-->>ExtMain: Instant feedback & suggestions
        ExtMain-->>Editor: Deliver feedback, suggestions
        Editor->>Student: Show real-time advice (status bar, notification, inline, etc.)
    end
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
```mermaid
sequenceDiagram
    actor Reviewer as "Peer Reviewer"
    actor Author as "Code Author"
    participant PR as "Code/PR (Review Platform)"
    participant Ext as "Extension Backend"
    participant AI as "AI Agent"

    Reviewer->>PR: Submit peer review feedback
    PR->>Ext: Notify/collect review feedback for PR
    Ext->>AI: Send code + review comments
    AI-->>Ext: Analyze & generate improvement suggestions
    Ext-->>Author: Send actionable suggestions (UI/notification)
    Author->>Ext: (Optionally) asks for clarification or next steps
    Ext->>AI: (Optionally) forwards follow-up to AI agent for further guidance
    AI-->>Ext: Further clarification/explanation
    Ext-->>Author: Show details/advice
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
```mermaid
sequenceDiagram
    box "VS Code"
        actor Lead as "Team Lead/Member"
        participant Webview as "Extension UI/Webview"
        participant ExtMain as "Extension Backend"
    end
    box "Backend & System"
        participant DB as "DatabaseService"
        participant SB as "Supabase"
        participant Notif as "Notification Service"
    end

    Lead->>Webview: Click "Finalize & Submit Project"
    Webview->>ExtMain: Request final submission (with project ID)
    ExtMain->>DB: Check project status, ready to submit?
    DB-->>ExtMain: Status OK / not ready / errors

    alt Project ready for submission
        ExtMain->>DB: Mark project as finalized/submitted
        DB->>SB: Update project record (finalized, lock edits)
        SB-->>DB: Confirmation
        DB-->>ExtMain: Submission recorded
        ExtMain->>Notif: Notify all team members (success)
        Notif-->>Lead: "Submission successful!" (notification)
        ExtMain-->>Webview: Show confirmation
        Webview->>Lead: Display success message
    else Project not complete / errors
        ExtMain-->>Webview: Show error/details
        Webview->>Lead: Show reason not finalized
    end
```

***
