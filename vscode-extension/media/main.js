const vscode = acquireVsCodeApi();

const teamForm = document.getElementById('team-form');
const teamStatus = document.getElementById('team-status');
const allocForm = document.getElementById('alloc-form');
const allocOutput = document.getElementById('alloc-output');

teamForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const teamName = document.getElementById('team-name').value.trim();
  const problem = document.getElementById('problem').value.trim();
  const membersRaw = document.getElementById('members').value.trim();

  const members = membersRaw
    ? membersRaw.split(',').map(s => {
        const [name, skills] = s.split(':');
        return { name: (name || '').trim(), skills: (skills || '').split(/[,\s/|]+/).filter(Boolean) };
      })
    : [];

  vscode.postMessage({ type: 'createTeam', payload: { teamName, problem, members } });
});

allocForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const requirements = document.getElementById('requirements').value;
  vscode.postMessage({ type: 'allocateTasks', payload: { requirements, members: [] } });
});

window.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  if (type === 'teamSaved') {
    teamStatus.textContent = '✅ Team saved to workspace.';
  }
  if (type === 'allocation') {
    allocOutput.textContent = JSON.stringify(payload, null, 2);
  }
});
