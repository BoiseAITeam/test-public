import express from 'express';
import bodyParser from 'body-parser';
import { spawn } from 'child_process';

const app = express();
app.use(bodyParser.json());

const PORT = Number(process.env.PORT || 3001);
const MCP_API_KEY = process.env.MCP_ADAPTER_API_KEY || 'super-secret-token';

// Note: This adapter assumes it can launch the local `@openbnb/mcp-server-airbnb` process
// and communicate via in-memory routing (this is a conceptual stub).
let mcpProcess: ReturnType<typeof spawn> | null = null;

/**
 * Start/restart the external MCP process.
 * In production, prefer starting this as a separate service and do not restart very often.
 */
function startMcpServer() {
  if (mcpProcess) {
    return;
  }

  mcpProcess = spawn('npx', ['-y', '@openbnb/mcp-server-airbnb'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });

  mcpProcess.stdout?.on('data', (data) => {
    console.log('[MCP]', data.toString());
  });

  mcpProcess.stderr?.on('data', (data) => {
    console.error('[MCP ERR]', data.toString());
  });

  mcpProcess.on('exit', (code, signal) => {
    console.warn(`MCP process exited code=${code} signal=${signal}`);
    mcpProcess = null;
  });
}

startMcpServer();

app.use((req, res, next) => {
  const header = req.headers['x-api-key'];
  if (header !== MCP_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
});

app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

app.post('/search', async (req, res) => {
  // TODO: implement true MCP request/response IPC protocol, this is placeholder.
  res.json({ results: [], warning: 'mcp-server-airbnb adapter is not fully implemented yet.' });
});

app.get('/listing/:id', async (req, res) => {
  res.json({ id: req.params.id, warning: 'not implemented' });
});

app.listen(PORT, () => {
  console.log(`MCP Airbnb adapter is running on http://localhost:${PORT}`);
});
