const vscode = acquireVsCodeApi();

vscode.postMessage({ type: "init" });

const teamForm = document.getElementById("team-form");
const teamStatus = document.getElementById("team-status");
const allocForm = document.getElementById("alloc-form");
const allocOutput = document.getElementById("alloc-output");

teamForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const teamName = document.getElementById("team-name").value.trim();
  const problem = document.getElementById("problem").value.trim();
  const membersRaw = document.getElementById("members").value.trim();

  const members = membersRaw
    ? membersRaw.split(",").map((s) => {
        const [name, skills] = s.split(":");
        return {
          name: (name || "").trim(),
          skills: (skills || "").split(/[,\s/|]+/).filter(Boolean),
        };
      })
    : [];

  vscode.postMessage({
    type: "createTeam",
    payload: { teamName, problem, members },
  });
});

allocForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const requirements = document.getElementById("requirements").value;
  const state =
    typeof vscode.getState === "function" ? vscode.getState() || {} : {};
  const members =
    state.team && Array.isArray(state.team.members) ? state.team.members : [];
  vscode.postMessage({
    type: "allocateTasks",
    payload: { requirements, members },
  });
});

window.addEventListener("message", (event) => {
  const { type, payload } = event.data;

  if (type === "teamSaved") {
    teamStatus.textContent = "✅ Team saved to workspace.";
    const teamName = document.getElementById("team-name").value.trim();
    const problem = document.getElementById("problem").value.trim();
    const membersRaw = document.getElementById("members").value.trim();
    const members = membersRaw
      ? membersRaw.split(",").map((s) => {
          const [name, skills] = s.split(":");
          return {
            name: (name || "").trim(),
            skills: (skills || "").split(/[,\s/|]+/).filter(Boolean),
          };
        })
      : [];
    if (typeof vscode.setState === "function")
      vscode.setState({ team: { teamName, problem, members } });
  }

  if (type === "teamLoaded") {
    if (payload) {
      document.getElementById("team-name").value = payload.teamName || "";
      document.getElementById("problem").value = payload.problem || "";
      document.getElementById("members").value = (payload.members || [])
        .map((m) => `${m.name}:${(m.skills || []).join(",")}`)
        .join(", ");
      if (typeof vscode.setState === "function")
        vscode.setState({ team: payload });
      teamStatus.textContent = "ℹ️ Loaded team from workspace.";
    } else {
      if (typeof vscode.setState === "function")
        vscode.setState({ team: null });
    }
  }

  if (type === "allocation") {
    allocOutput.textContent = JSON.stringify(payload, null, 2);
  }
});
