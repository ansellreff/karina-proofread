/** Stores on this computer (web/.data, web/prompts): local mode, tests and the command-line scripts. */
import path from "node:path";
import { LearnStore } from "../learn/store";
import { ConfigStore, promptsDir } from "../rules/config-store";
import { FileJobStore } from "../store/job-store";
import { scoped, type AppFiles } from "./files";
import { FsFiles } from "./fs-files";

export interface Stores {
  /** "online": the database (Vercel); "local": this computer's web/.data. */
  mode: "local" | "online";
  /** Everything the app keeps. */
  data: AppFiles;
  jobs: FileJobStore;
  learn: LearnStore;
  config: ConfigStore;
}

export const localDataDir = () => path.join(process.cwd(), ".data");

/** The stores on top of any set of files (online: rules and rulebook under settings/, bundled prompts as defaults). */
export function storesOn(data: AppFiles, mode: Stores["mode"]): Stores {
  return { mode, data, jobs: new FileJobStore(data), learn: new LearnStore(scoped(data, "learning")), config: new ConfigStore(scoped(data, "settings")) };
}

export function localStores(): Stores {
  if (process.env.VERCEL) throw new Error("There are no local files online: DATABASE_URL must be set.");
  const data = new FsFiles(localDataDir());
  const learn = process.env.KP_LEARN_DIR ? new FsFiles(process.env.KP_LEARN_DIR) : scoped(data, "learning");
  return { mode: "local", data, jobs: new FileJobStore(data), learn: new LearnStore(learn), config: new ConfigStore(new FsFiles(promptsDir())) };
}
