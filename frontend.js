
const app = document.getElementById('app');

async function init() {
  if (!app) return;

  app.innerHTML = `
    <main style="max-width:900px;margin:60px auto;padding:24px;font-family:Inter,Arial,sans-serif">
      <h1>Smart Campus Management</h1>
      <p>Checking server and database connection...</p>
      <div id="status">Loading...</div>
    </main>
  `;

  const status = document.getElementById('status');

  try {
    const response = await fetch('/api/health');
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Server request failed');
    }

    status.innerHTML = `
      <p style="color:green">Server and database connection successful.</p>
      <p>Status: ${result.data.status}</p>
      <a href="/login.html">Go to Login</a>
    `;
  } catch (error) {
    status.textContent = 'Connection failed: ' + error.message;
  }
}

init();
