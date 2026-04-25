import type { Hono } from "hono";
import type { AppBindings } from "../effect-handler.ts";

export type RouteModule<TApp extends Hono<{ Bindings: AppBindings }>> = {
	readonly app: TApp;
	readonly testApp: TApp;
};
