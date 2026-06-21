import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { GoogleHandler } from "./google-handler";

type Props = {
	sub: string;
	email: string;
	emailVerified: boolean;
	name?: string;
	picture?: string;
	accessToken: string;
};

type BackendDumpRequest = {
	type: "note" | "image" | "link" | "music" | "video" | "pdf" | "instagram" | "reel";
	email: string;
	world?: string;
	title?: string;
	text?: string;
	url?: string;
	imageUrl?: string;
	description?: string;
	notes?: string;
	artist?: string;
	album?: string;
	caption?: string;
	username?: string;
	coverUrl?: string;
	previewUrl?: string;
	lyrics?: string;
	durationSeconds?: number;
	releaseYear?: number;
	genre?: string;
	reaction?: string;
};

const worldSchema = z
	.string()
	.trim()
	.min(1)
	.max(100)
	.optional()
	.describe(
		"Optional world ID or exact world name. When omitted, the user's default world is used.",
	);

const titleSchema = z.string().trim().min(1).max(120).optional();
const publicUrlSchema = z
	.url()
	.refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
		message: "URL must use HTTP or HTTPS.",
	});

type DumpdConfigEnv = Env &
	Partial<Record<"DUMPD_API_URL" | "MCP_INGEST_SECRET", string>>;

function jsonToolResult(payload: unknown, isError = false) {
	return {
		content: [
			{
				text: JSON.stringify(payload, null, 2),
				type: "text" as const,
			},
		],
		isError,
	};
}

function getRequiredConfig(env: DumpdConfigEnv) {
	const apiUrl = env.DUMPD_API_URL?.trim().replace(/\/$/, "");
	const secret = env.MCP_INGEST_SECRET?.trim();

	if (!apiUrl || !secret) {
		throw new Error(
			"Missing DUMPD_API_URL or MCP_INGEST_SECRET in the MCP Worker configuration.",
		);
	}

	return { apiUrl, secret };
}

async function postToBackend(env: Env, path: string, payload: unknown) {
	try {
		const { apiUrl, secret } = getRequiredConfig(env);
		const response = await fetch(`${apiUrl}${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${secret}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		return jsonToolResult((await response.json()) as unknown, !response.ok);
	} catch (error) {
		return jsonToolResult(
			{
				error:
					error instanceof Error ? error.message : "Could not reach the dumpd backend.",
			},
			true,
		);
	}
}

function decodeHtml(value: string) {
	return value
		.replaceAll("&amp;", "&")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replace(/\s+/g, " ")
		.trim();
}

function readMeta(html: string, key: string) {
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const patterns = [
		new RegExp(
			`<meta[^>]+(?:property|name)=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`,
			"i",
		),
		new RegExp(
			`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapedKey}["'][^>]*>`,
			"i",
		),
	];

	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (match?.[1]) return decodeHtml(match[1]);
	}

	return undefined;
}

async function inspectLink(url: string) {
	const response = await fetch(url, {
		headers: {
			Accept: "text/html,application/xhtml+xml",
			"User-Agent": "dumpd-mcp/1.0",
		},
		redirect: "follow",
	});

	if (!response.ok) {
		throw new Error(`Could not inspect link (${response.status}).`);
	}

	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
		return {};
	}

	const maximumBytes = 1_000_000;
	const contentLength = Number(response.headers.get("content-length") ?? "0");
	if (contentLength > maximumBytes) {
		return {};
	}

	const html = (await response.text()).slice(0, maximumBytes);
	const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

	const rawImageUrl = readMeta(html, "og:image");
	let imageUrl: string | undefined;
	if (rawImageUrl) {
		try {
			const resolved = new URL(rawImageUrl, response.url || url);
			if (resolved.protocol === "http:" || resolved.protocol === "https:") {
				imageUrl = resolved.toString();
			}
		} catch {
			// Invalid preview images should not prevent saving the link.
		}
	}

	return {
		title:
			readMeta(html, "og:title") ??
			(titleMatch?.[1] ? decodeHtml(titleMatch[1]) : undefined),
		description:
			readMeta(html, "og:description") ?? readMeta(html, "description"),
		imageUrl,
	};
}

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "dumpd MCP Server",
		version: "2.0.0",
	});

	async init() {
		this.server.tool(
			"save_note",
			"Save a text note to dumpd. Specify a world by ID or exact name, or omit it to use the user's default world.",
			{
				text: z.string().trim().min(1).max(50_000),
				title: titleSchema.describe(
					"Optional note title. If omitted, the backend derives one from the note.",
				),
				world: worldSchema,
				reaction: z
					.string()
					.trim()
					.max(500)
					.optional()
					.describe(
						"Optional first-person note from the user about why they saved this — their feeling, intent, or what it reminded them of.",
					),
			},
			async ({ text, title, world, reaction }) =>
				postToBackend(this.env, "/api/mcp/dumps", {
					type: "note",
					email: this.props!.email,
					text,
					title,
					world,
					reaction,
				} satisfies BackendDumpRequest),
		);

		this.server.tool(
			"save_image",
			"Save an image and its already-extracted text to dumpd. The MCP client must inspect the image and provide the text; dumpd does not process the image.",
			{
				imageUrl: publicUrlSchema.describe("A publicly reachable image URL."),
				text: z
					.string()
					.trim()
					.min(1)
					.max(50_000)
					.describe(
						"Text extracted from the image by the MCP client, including visible text and a factual description.",
					),
				title: titleSchema.describe(
					"Optional image title. If omitted, the extracted text is used to derive it.",
				),
				world: worldSchema,
				reaction: z
					.string()
					.trim()
					.max(500)
					.optional()
					.describe(
						"Optional first-person note from the user about why they saved this — their feeling, intent, or what it reminded them of.",
					),
			},
			async ({ imageUrl, text, title, world, reaction }) =>
				postToBackend(this.env, "/api/mcp/dumps", {
					type: "image",
					email: this.props!.email,
					url: imageUrl,
					text,
					title,
					world,
					reaction,
				} satisfies BackendDumpRequest),
		);

		this.server.tool(
			"save_link",
			"Save a web link to dumpd. The tool inspects HTML metadata for a title and description when they are not supplied.",
			{
				url: publicUrlSchema,
				title: titleSchema,
				description: z.string().trim().max(2_000).optional(),
				notes: z.string().trim().max(10_000).optional(),
				text: z
					.string()
					.trim()
					.min(1)
					.max(50_000)
					.describe(
						"Full text or a detailed factual extraction of the linked page supplied by the MCP client.",
					),
				world: worldSchema,
				reaction: z
					.string()
					.trim()
					.max(500)
					.optional()
					.describe(
						"Optional first-person note from the user about why they saved this — their feeling, intent, or what it reminded them of.",
					),
			},
			async ({
				url,
				title,
				description,
				notes,
				text,
				world,
				reaction,
			}) => {
				let metadata: {
					title?: string;
					description?: string;
					imageUrl?: string;
				} = {};
				try {
					metadata = await inspectLink(url);
				} catch {
					// A link remains useful when metadata inspection fails.
				}

				return postToBackend(this.env, "/api/mcp/dumps", {
					type: "link",
					email: this.props!.email,
					url,
					imageUrl: metadata.imageUrl,
					title: title ?? metadata.title,
					description: description ?? metadata.description,
					notes,
					text,
					world,
					reaction,
				} satisfies BackendDumpRequest);
			},
		);

		this.server.tool(
			"save_music",
			"Save music to dumpd from a public Spotify, Apple Music, YouTube, SoundCloud, or other music link. Include known metadata and lyrics when available; never invent missing lyrics. The tool inspects page metadata and stores cover art in Supabase Storage when a cover URL is available.",
			{
				url: publicUrlSchema.describe("The public song, album, or music URL."),
				title: titleSchema.describe(
					"Song or recording title. Page metadata is used when omitted.",
				),
				artist: z.string().trim().min(1).max(200).optional(),
				album: z.string().trim().min(1).max(200).optional(),
				coverUrl: publicUrlSchema
					.optional()
					.describe("Public album or track cover image URL."),
				previewUrl: publicUrlSchema
					.optional()
					.describe(
						"Optional direct audio preview URL. Provider links are embedded automatically.",
					),
				lyrics: z
					.string()
					.trim()
					.max(50_000)
					.optional()
					.describe(
						"Known lyrics supplied by the user or an authorized source. Do not generate or guess lyrics.",
					),
				durationSeconds: z.number().positive().max(86_400).optional(),
				releaseYear: z.number().int().min(1000).max(3000).optional(),
				genre: z.string().trim().min(1).max(120).optional(),
				notes: z.string().trim().max(5_000).optional(),
				text: z
					.string()
					.trim()
					.min(1)
					.max(50_000)
					.describe(
						"Text extracted from the music/audio by the MCP client, such as a transcript, authorized lyrics, or factual description.",
					),
				world: worldSchema,
				reaction: z
					.string()
					.trim()
					.max(500)
					.optional()
					.describe(
						"Optional first-person note from the user about why they saved this — their feeling, intent, or what it reminded them of.",
					),
			},
			async ({
				url,
				title,
				artist,
				album,
				coverUrl,
				previewUrl,
				lyrics,
				durationSeconds,
				releaseYear,
				genre,
				notes,
				text,
				world,
				reaction,
			}) => {
				let metadata: {
					title?: string;
					description?: string;
					imageUrl?: string;
				} = {};

				if (!title || !coverUrl) {
					try {
						metadata = await inspectLink(url);
					} catch {
						// The source link and supplied metadata are enough to save the item.
					}
				}

				return postToBackend(this.env, "/api/mcp/dumps", {
					type: "music",
					email: this.props!.email,
					url,
					title: title ?? metadata.title,
					artist,
					album,
					coverUrl: coverUrl ?? metadata.imageUrl,
					previewUrl,
					lyrics,
					durationSeconds,
					releaseYear,
					genre,
					notes: notes ?? metadata.description,
					text,
					world,
					reaction,
				} satisfies BackendDumpRequest);
			},
		);

		this.server.tool(
			"save_video",
			"Save a video URL and text already extracted by the MCP client. Dumpd stores the supplied text and uses it for knowledge extraction.",
			{
				url: publicUrlSchema,
				text: z.string().trim().min(1).max(50_000),
				title: titleSchema,
				world: worldSchema,
				reaction: z
					.string()
					.trim()
					.max(500)
					.optional()
					.describe(
						"Optional first-person note from the user about why they saved this — their feeling, intent, or what it reminded them of.",
					),
			},
			async ({ url, text, title, world, reaction }) =>
				postToBackend(this.env, "/api/mcp/dumps", {
					type: "video",
					email: this.props!.email,
					url,
					text,
					title,
					world,
					reaction,
				} satisfies BackendDumpRequest),
		);

		this.server.tool(
			"save_pdf",
			"Save a PDF URL and text already extracted by the MCP client. Dumpd stores the supplied text and uses it for knowledge extraction.",
			{
				url: publicUrlSchema,
				text: z.string().trim().min(1).max(50_000),
				title: titleSchema,
				world: worldSchema,
				reaction: z
					.string()
					.trim()
					.max(500)
					.optional()
					.describe(
						"Optional first-person note from the user about why they saved this — their feeling, intent, or what it reminded them of.",
					),
			},
			async ({ url, text, title, world, reaction }) =>
				postToBackend(this.env, "/api/mcp/dumps", {
					type: "pdf",
					email: this.props!.email,
					url,
					text,
					title,
					world,
					reaction,
				} satisfies BackendDumpRequest),
		);

		this.server.tool(
			"save_instagram",
			"Save an Instagram post or Reel to dumpd. Instagram blocks iframes so the item is saved as a branded link card. The MCP client must extract the caption and a thumbnail URL; dumpd does not scrape Instagram directly.",
			{
				url: publicUrlSchema.describe("The instagram.com post or reel URL."),
				text: z
					.string()
					.trim()
					.min(1)
					.max(50_000)
					.describe("Full caption and any other text extracted from the post by the MCP client."),
				imageUrl: publicUrlSchema
					.optional()
					.describe("Publicly reachable thumbnail or cover image URL for the post or reel."),
				caption: z
					.string()
					.trim()
					.max(5_000)
					.optional()
					.describe("The post caption text."),
				username: z
					.string()
					.trim()
					.max(100)
					.optional()
					.describe("The Instagram account username (without @)."),
				title: titleSchema,
				world: worldSchema,
				reaction: z
					.string()
					.trim()
					.max(500)
					.optional()
					.describe("Optional first-person note about why you saved this."),
			},
			async ({ url, text, imageUrl, caption, username, title, world, reaction }) => {
				const isReel = url.includes("/reel/");
				return postToBackend(this.env, "/api/mcp/dumps", {
					type: isReel ? "reel" : "instagram",
					email: this.props!.email,
					url,
					text,
					imageUrl,
					caption,
					username,
					title,
					world,
					reaction,
				} satisfies BackendDumpRequest);
			},
		);

			this.server.tool(
				"get_item",
				"Get one saved dumpd item by ID, including its permanent source content and metadata.",
				{ id: z.string().min(1) },
				async ({ id }) =>
					postToBackend(this.env, "/api/mcp/dumps/manage", {
						action: "get",
						email: this.props!.email,
						id,
					}),
			);

			this.server.tool(
				"list_items",
				"List saved dumpd items in a world.",
				{
					world: worldSchema,
					limit: z.number().int().min(1).max(100).default(50),
				},
				async ({ world, limit }) =>
					postToBackend(this.env, "/api/mcp/dumps/manage", {
						action: "list",
						email: this.props!.email,
						world,
						limit,
					}),
			);

			this.server.tool(
				"search_knowledge",
				"Search the authenticated user's saved knowledge with hybrid semantic, keyword, and graph retrieval, then answer from the retrieved sources.",
				{
					query: z.string().trim().min(1).max(10_000),
					modality: z.array(z.string().trim().min(1)).max(20).optional(),
					limit: z.number().int().min(1).max(20).optional(),
					graphHops: z.number().int().min(1).max(5).optional(),
					dateFrom: z.iso.datetime().optional(),
					dateTo: z.iso.datetime().optional(),
				},
				async ({ query, modality, limit, graphHops, dateFrom, dateTo }) =>
					postToBackend(this.env, "/api/mcp/dumps/manage", {
						action: "retrieve",
						email: this.props!.email,
						query,
						modality,
						limit,
						graphHops,
						dateFrom,
						dateTo,
					}),
			);

			this.server.tool(
				"update_item",
				"Update an item's title or extracted text.",
				{
					id: z.string().min(1),
					title: titleSchema,
					text: z.string().trim().min(1).max(100_000).optional(),
				},
				async ({ id, title, text }) =>
					postToBackend(this.env, "/api/mcp/dumps/manage", {
						action: "update",
						email: this.props!.email,
						id,
						title,
						text,
					}),
			);

			this.server.tool(
				"delete_item",
				"Permanently delete an item and any stored media.",
				{ id: z.string().min(1) },
				async ({ id }) =>
					postToBackend(this.env, "/api/mcp/dumps/manage", {
						action: "delete",
						email: this.props!.email,
						id,
					}),
			);

			this.server.tool(
				"list_worlds",
			"List the authenticated user's dumpd worlds. Use this when the requested world is ambiguous.",
			{},
			async () =>
				postToBackend(this.env, "/api/mcp/worlds", {
					email: this.props!.email,
				}),
		);
	}
}

const oauthProvider = new OAuthProvider({
	apiHandler: MyMCP.serve("/mcp"),
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GoogleHandler as any,
	tokenEndpoint: "/token",
});

const temporaryMcpAliases = new Set([
	"/28f5ef53-91f5-482f-90d2-b1c72487576a/mcp",
]);

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);
		const normalizedPath = url.pathname.replace(/\/+$/, "");
		const routedRequest = temporaryMcpAliases.has(normalizedPath)
			? new Request(
					(() => {
						url.pathname = "/mcp";
						return url;
					})(),
					request,
				)
			: request;

		return oauthProvider.fetch(
			routedRequest,
			{
				...env,
				OAUTH_KV: env.MCP_OAUTH_KV,
			},
			ctx,
		);
	},
} satisfies ExportedHandler<Env>;
