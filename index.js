import config from "./config.json";
import { startProcesses } from "./processes";
import { proxyMappings } from "./state";
import webhook from "./webhook";

Bun.serve({
  port: 5000,
  hostname: "127.0.0.1",
  development: false,
  async fetch(req, server) {
    if (!req.headers.has("host")) return new Response("not ok");
    const host = new URL(req.url);
    const { hostname } = host;
    const domain = hostname.split(".");
    const rootDomain = domain.slice(-3).join(".");
    if (rootDomain != config.rootDomain)
      return new Response("Only accessible through valid root domain", {
        status: 404,
      });
    const subDomain = domain.at(-4);
    if (!subDomain) return webhook(req, server);
    if (!(subDomain in config.mappings) && !(subDomain in proxyMappings))
      return new Response("No mapping is configured for this subdomain", {
        status: 404,
      });
    const proxyDomain = config.mappings[subDomain] || proxyMappings[subDomain];
    const proxiedUrl = `${host.protocol}//${proxyDomain}${host.pathname}${host.search}`;
    let newReq = req.clone();
    newReq.headers.append("x-forwarded-for", server.requestIP(req).address);
    Object.defineProperty(newReq, "body", { writable: true });
    Object.defineProperty(newReq, "redirect", { writable: true });
    if (req.body) {
      newReq.body = (await req.body.getReader().read()).value;
    }
    newReq.redirect = "manual";
    try {
      const res = await fetch(proxiedUrl, newReq);
      res.headers.delete("content-encoding");
      return res;
    } catch (e) {
      return new Response(null, { status: 500 });
    }
  },
});

await startProcesses();

console.log(`Listening on localhost:5000`);
