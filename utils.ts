import { createDefine } from "fresh";

// Request-scoped data shared by middlewares, layouts, and routes.
export interface State {
  shared?: string;
}

export const define = createDefine<State>();
