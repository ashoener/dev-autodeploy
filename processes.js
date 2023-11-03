import config from "./config.json";
import fs from "fs/promises";
import path from "path";
import * as portfinder from "portfinder";
import { repoMappings, proxyMappings } from "./state";

const usedPorts = [];
let bootingUp = true;

portfinder.setBasePort(5001);

async function getOpenPort() {
  if (usedPorts.length) portfinder.setBasePort(usedPorts.at(-1) + 1);
  const port = await portfinder.getPortPromise();
  usedPorts.push(port);
  return port;
}

const spawnData = async () => ({
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
    GIT_SSH_COMMAND: `ssh -i ${config.sshKey} -o IdentitiesOnly=yes`,
    PORT: bootingUp ? await getOpenPort() : await portfinder.getPortPromise(),
  },
});

/**
 * @type {Object<string,import("bun").Subprocess}
 */
export const deployedProcesses = {};

export async function startProcesses() {
  for (let folder of config.repos) {
    await startProcess(folder);
  }
  bootingUp = false;
}

export async function stopProcess(repo) {
  if (repo in deployedProcesses) {
    deployedProcesses[repo].kill();
    delete deployedProcesses[repo];
    delete proxyMappings[repoMappings[repo]];
    delete repoMappings[repo];
  }
}

export async function startProcess(repo) {
  const repoPath = path.join(import.meta.dir, "repos", repo);
  const deployConfigFile = path.join(repoPath, "deploy.json");
  const deployConfig = JSON.parse(await fs.readFile(deployConfigFile, "utf8"));
  const data = await spawnData();
  const installProcess = Bun.spawn({
    cmd: [...deployConfig.install.split(" ")],
    cwd: repoPath,
    ...data,
  });
  await installProcess.exited;
  const port = data.env.PORT;
  repoMappings[repo] = deployConfig.subdomain || repo;
  proxyMappings[repoMappings[repo]] = `127.0.0.1:${port}`;
  deployedProcesses[repo] = Bun.spawn({
    cmd: [...deployConfig.start.split(" ")],
    cwd: repoPath,
    ...data,
  });
  console.log(
    `Started ${repo} on ${proxyMappings[repoMappings[repo]]}, with subdomain ${
      repoMappings[repo]
    }`
  );
}
