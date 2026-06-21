# dumpd Model Context Protocol (MCP) Server

This is dumpd's remote [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) server with Google OAuth.

You can deploy it to your own Cloudflare account, and after you create your own Google OAuth client app, you'll have a fully functional remote MCP server that you can build off. Users will be able to connect to your MCP server by signing in with their Google account.

You can use this as a reference example for how to integrate other OAuth providers with an MCP server deployed to Cloudflare, using the [`workers-oauth-provider` library](https://github.com/cloudflare/workers-oauth-provider).

The MCP server (powered by [Cloudflare Workers](https://developers.cloudflare.com/workers/)):

- Acts as OAuth _Server_ to your MCP clients
- Acts as OAuth _Client_ to your _real_ OAuth server (in this case, Google)

> [!WARNING]
> This is a demo template designed to help you get started quickly. While we have implemented several security controls, **you must implement all preventive and defense-in-depth security measures before deploying to production**. Please review our comprehensive security guide: [Securing MCP Servers](https://github.com/cloudflare/agents/blob/main/docs/securing-mcp-servers.md)

## Getting Started

Clone the repo directly & install dependencies: `npm install`.

### For Production

Create a new Google OAuth web client in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

- For the authorized JavaScript origin, specify `https://dumpd-mcp.<your-subdomain>.workers.dev`
- For the authorized redirect URI, specify `https://dumpd-mcp.<your-subdomain>.workers.dev/callback`
- Note your Client ID and generate a Client secret.
- Set secrets via Wrangler

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY # add any random string here e.g. openssl rand -hex 32
wrangler secret put DUMPD_API_URL # your deployed Next.js app URL
wrangler secret put MCP_INGEST_SECRET # same 32+ character value as the web app
```

> [!IMPORTANT]
> When you create the first secret, Wrangler will ask if you want to create a new Worker. Submit "Y" to create a new Worker and save the secret.

#### Set up a KV namespace

- Create the KV namespace:
  `wrangler kv namespace create "MCP_OAUTH_KV"`
- Update the Wrangler file with the KV ID

#### Deploy & Test

Deploy the MCP server to make it available on your workers.dev domain
` wrangler deploy`

Test the remote server using [Inspector](https://modelcontextprotocol.io/docs/tools/inspector):

```
npx @modelcontextprotocol/inspector@latest
```

Enter `https://dumpd-mcp.<your-subdomain>.workers.dev/mcp` and hit connect. Once you go through the authentication flow, you'll see the tools working.

You now have a remote MCP server deployed!

### Tools

This MCP server uses Google OAuth for authentication. All authenticated Google users can access these tools:

- `save_note`: stores a text note.
- `save_image`: stores a public image plus text already extracted by the MCP client.
- `save_link`: stores a URL and inspects HTML metadata for a title and description.
- `save_music`: stores a music link, metadata, and text already extracted by the MCP client.
- `save_video`: stores a video URL plus text already extracted by the MCP client.
- `save_pdf`: stores a PDF URL plus text already extracted by the MCP client.
- `get_item`: reads one item and its permanent source content.
- `list_items`: lists items in a world.
- `update_item`: updates an item's title or text.
- `delete_item`: permanently removes the item and its stored media.
- `list_worlds`: lists the authenticated user's available worlds.

For images, music/audio, videos, and PDFs, the MCP client is responsible for
converting the media to text before calling the save tool. Dumpd does not
download media for AI transcription. The web ingestion endpoint stores the
supplied source content directly in Postgres for the canvas.

Each save tool accepts an optional `world` ID or exact world name. If it is omitted, dumpd uses the user's default world and creates `My World` if the user has no worlds yet.

### Access the remote MCP server from Claude Desktop

Open Claude Desktop and navigate to Settings -> Developer -> Edit Config. This opens the configuration file that controls which MCP servers Claude can access.

Replace the content with the following configuration. Once you restart Claude Desktop, a browser window will open showing your OAuth login page. Complete the authentication flow to grant Claude access to your MCP server. After you grant access, the tools will become available for you to use.

```
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://dumpd-mcp.<your-subdomain>.workers.dev/mcp"
      ]
    }
  }
}
```

Once the Tools show up in the interface, you can ask Claude to store or search memories.

### For Local Development

If you'd like to iterate and test your MCP server, you can do so in local development. This will require you to create another Google OAuth web client:

- For the Homepage URL, specify `http://localhost:8788`
- For the Authorization callback URL, specify `http://localhost:8788/callback`
- Note your Client ID and generate a Client secret.
- Create a `.dev.vars` file in your project root with:

```
GOOGLE_CLIENT_ID=your_development_google_client_id
GOOGLE_CLIENT_SECRET=your_development_google_client_secret
COOKIE_ENCRYPTION_KEY=your_cookie_encryption_key
DUMPD_API_URL=http://localhost:3000
MCP_INGEST_SECRET=the_same_32_character_secret_as_apps_web
```

#### Develop & Test

Run the server locally to make it available at `http://localhost:8788`
`wrangler dev`

To test the local server, enter `http://localhost:8788/mcp` into Inspector and hit connect. Once you follow the prompts, you'll be able to "List Tools".

#### Using Claude and other MCP Clients

When using Claude to connect to your remote MCP server, you may see some error messages. This is because Claude Desktop doesn't yet support remote MCP servers, so it sometimes gets confused. To verify whether the MCP server is connected, hover over the 🔨 icon in the bottom right corner of Claude's interface. You should see your tools available there.

#### Using Cursor and other MCP Clients

To connect Cursor with your MCP server, choose `Type`: "Command" and in the `Command` field, combine the command and args fields into one (e.g. `npx mcp-remote https://<your-worker-name>.<your-subdomain>.workers.dev/mcp`).

Note that while Cursor supports HTTP+SSE servers, it doesn't support authentication, so you still need to use `mcp-remote` (and to use a STDIO server, not an HTTP one).

You can connect your MCP server to other MCP clients like Windsurf by opening the client's configuration file, adding the same JSON that was used for the Claude setup, and restarting the MCP client.

## How does it work?

#### OAuth Provider

The OAuth Provider library serves as a complete OAuth 2.1 server implementation for Cloudflare Workers. It handles the complexities of the OAuth flow, including token issuance, validation, and management. In this project, it plays the dual role of:

- Authenticating MCP clients that connect to your server
- Managing the connection to Google's OAuth services
- Securely storing tokens and authentication state in KV storage

#### Durable MCP

Durable MCP extends the base MCP functionality with Cloudflare's Durable Objects, providing:

- Persistent state management for your MCP server
- Secure storage of authentication context between requests
- Access to authenticated user information via `this.props`
- Support for conditional tool availability based on user identity

#### MCP Remote

The MCP Remote library enables your server to expose tools that can be invoked by MCP clients like the Inspector. It:

- Defines the protocol for communication between clients and your server
- Provides a structured way to define tools
- Handles serialization and deserialization of requests and responses
- Maintains the Server-Sent Events (SSE) connection between clients and your server
