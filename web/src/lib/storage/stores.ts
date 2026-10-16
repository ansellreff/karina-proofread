/**
 * The stores for the current request: Karina's OneDrive once sign-in is configured, otherwise this computer
 * (web/.data, web/prompts) for development and tests. Pages and route handlers only.
 */
import { redirect } from "next/navigation";
import { authConfig } from "../auth/config";
import { currentSession } from "../auth/current";
import type { Session } from "../auth/session";
import { LearnStore } from "../learn/store";
import { Graph } from "../onedrive/graph";
import { ConfigStore } from "../rules/config-store";
import { FileJobStore } from "../store/job-store";
import { scoped } from "./files";
import { localStores, type Stores } from "./local";
import { OneDriveFiles } from "./onedrive-files";

export type { Stores };

/** In OneDrive, the app's working files live in this subfolder of Karina's project folder. */
export const APP_DATA = "App data";

export function oneDriveStores(session: Session & { folderId: string }, fetcher?: typeof fetch): Stores {
  const graph = new Graph(session.accessToken, fetcher);
  const data = scoped(new OneDriveFiles(graph, session.folderId), APP_DATA);
  return {
    mode: "onedrive",
    data,
    jobs: new FileJobStore(data),
    learn: new LearnStore(scoped(data, "learning")),
    config: new ConfigStore(scoped(data, "settings")),
    session,
    graph,
  };
}

/** This request's stores. Online without a session: to the sign-in page; without a project folder: to setup. */
export async function stores(): Promise<Stores> {
  const cfg = authConfig();
  if (!cfg) return localStores();
  const session = await currentSession(cfg);
  if (!session) redirect("/login");
  if (!session.folderId) redirect("/setup");
  return oneDriveStores({ ...session, folderId: session.folderId });
}
