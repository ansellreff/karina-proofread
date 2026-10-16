/** Stores on this computer (web/.data, web/prompts): local mode, tests and the command-line scripts. */
import path from "node:path";
import type { Session } from "../auth/session";
import { LearnStore } from "../learn/store";
import type { Graph } from "../onedrive/graph";
import { ConfigStore, promptsDir } from "../rules/config-store";
import { FileJobStore } from "../store/job-store";
import { scoped, type AppFiles } from "./files";
import { FsFiles } from "./fs-files";

export interface Stores {
  mode: "local" | "onedrive";
  /** Everything the app keeps (local: web/.data; online: "<project folder>/App data"). */
  data: AppFiles;
  jobs: FileJobStore;
  learn: LearnStore;
  config: ConfigStore;
  /** Online only. */
  session?: Session;
  graph?: Graph;
}

export const localDataDir = () => path.join(process.cwd(), ".data");

export function localStores(): Stores {
  if (process.env.VERCEL) throw new Error("There are no local files online: sign-in (MS_CLIENT_ID) must be configured.");
  const data = new FsFiles(localDataDir());
  const learn = process.env.KP_LEARN_DIR ? new FsFiles(process.env.KP_LEARN_DIR) : scoped(data, "learning");
  return { mode: "local", data, jobs: new FileJobStore(data), learn: new LearnStore(learn), config: new ConfigStore(new FsFiles(promptsDir())) };
}
