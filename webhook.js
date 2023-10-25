import config from "./config.json";
import fs from "fs/promises";
import path from "path";
import { deployedProcesses, startProcess, stopProcess } from "./processes";
import { proxyMappings, repoMappings } from "./state";

/**
 * @param {Request} req
 * @param {import('bun').Server} server
 */
export default async (req, server) => {
  const url = new URL(req.url);
  if (url.pathname.slice(1) != config.webhookUrl)
    return new Response("", { status: 404 });
  if (req.method != "POST") return new Response("ok");
  let data;
  try {
    data = await req.json();
  } catch (e) {
    return new Response("", { status: 500 });
  }
  if (data.ref !== `refs/heads/${data.repository.master_branch}`)
    return Response("ok");
  const repo = data.repository.name;
  const repoUrl = data.repository.ssh_url;
  const repoPath = path.join(import.meta.dir, "repos", repo);
  const exists = await fs.exists(repoPath);
  const spawnData = {
    stdout: "pipe",
    env: {
      GIT_SSH_COMMAND: `ssh -i ${config.sshKey} -o IdentitiesOnly=yes`,
    },
  };
  /**
   * @type {import("bun").Subprocess}
   */
  let process;
  if (!exists) {
    process = Bun.spawn({
      cmd: ["git", "clone", repoUrl],
      cwd: path.join(import.meta.dir, "repos"),
      ...spawnData,
    });
  } else {
    process = Bun.spawn({
      cmd: ["git", "pull"],
      cwd: repoPath,
      ...spawnData,
    });
  }
  await process.exited;
  console.log("Pulled/created repo");
  const deployConfigFile = path.join(repoPath, "deploy.json");
  if (!(await fs.exists(deployConfigFile))) return new Response("ok");

  await Bun.sleep(2000);

  await stopProcess(repo);
  await startProcess(repo);
  if (!config.repos.includes(repo)) {
    config.repos.push(repo);
    fs.writeFile(
      path.join(import.meta.dir, "config.json"),
      JSON.stringify(config, null, 4)
    );
  }

  return new Response("ok");
};
