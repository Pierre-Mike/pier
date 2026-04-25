/**
 * Dashboard state types
 */

export interface Project {
	id: string;
	name: string;
	path: string;
	isGitRepo: boolean;
	lastModified: number;
}

export interface Session {
	url: string;
	sessionId?: string;
	iframe?: HTMLIFrameElement;
}

export interface FileEntry {
	path: string;
	size?: number;
}

export interface AppConfig {
	appPort: number;
	sandboxPort: number;
	zellijWebUrl: string;
	projectsRoot: string;
	artifactsDir: string;
	claudeProjectsRoot: string;
}

export interface ClaudeEvent {
	ts: number;
	uuid?: string;
	kind: string;
	project?: string;
	run?: string;
	name?: string;
	tool?: string;
	tool_id?: string;
	input?: unknown;
	text?: string;
	result?: unknown;
	status?: string;
	ok?: boolean;
	role?: string;
	duration_ms?: number;
	category?: string;
	source?: string;
}

export interface DashboardState extends Record<string, unknown> {
	projects: Project[];
	activeProject: string | null;
	projectFilter: string;
	projectHighlight: number;
	sessions: Map<string, Session>;
	files: FileEntry[];
	activeFilePath: string | null;
	fileFilter: string;
	expandedDirs: Set<string>;
	projectsWithEvents: Set<string>;
	logs: ClaudeEvent[];
	logsHistory: ClaudeEvent[];
	logsHistoryScope: { project: string; session: string } | null;
	logsHistoryLoading: boolean;
	logsMax: number;
	logsFilter: string;
	logsProject: string;
	logsSession: string;
	logsTab: string;
	logsFollow: boolean;
	logsOpen: boolean;
	logsHasNew: boolean;
	logsExpanded: Set<string>;
	toolUseMap: Map<string, { ts: number; name: string }>;
}
